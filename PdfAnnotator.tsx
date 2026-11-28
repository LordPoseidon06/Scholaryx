import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  MousePointer,
  Pencil,
  StickyNote,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString, formatTimestamp, getTimestampMillis } from '../lib/utils';
import type { AnnotationColor, HighlightRect, MaterialAnnotation } from '../types';
import { SegmentedTabs } from './MotionPrimitives';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ToolMode = 'select' | 'highlight' | 'note';

interface PdfAnnotatorProps {
  dataUrl: string;
  materialId: string;
  fileName?: string;
  readOnly?: boolean;
}

interface PendingSelection {
  pageNumber: number;
  selectedText: string;
  rects: HighlightRect[];
  anchorX: number;
  anchorY: number;
}

interface PendingStickyDraft {
  pageNumber: number;
  x: number;
  y: number;
  noteText: string;
  highlightRects?: HighlightRect[];
  selectedText?: string;
}

const COLOR_STYLES: Record<
  AnnotationColor,
  {
    label: string;
    swatch: string;
    highlightBg: string;
    pinBg: string;
    cardTint: string;
  }
> = {
  amber: {
    label: 'Yellow',
    swatch: 'bg-amber-400',
    highlightBg: 'bg-amber-300/45 hover:bg-amber-300/65',
    pinBg: 'bg-amber-400 text-amber-950 border-amber-500',
    cardTint: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/25',
  },
  emerald: {
    label: 'Green',
    swatch: 'bg-emerald-400',
    highlightBg: 'bg-emerald-300/40 hover:bg-emerald-300/60',
    pinBg: 'bg-emerald-400 text-emerald-950 border-emerald-500',
    cardTint: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/25',
  },
  blue: {
    label: 'Blue',
    swatch: 'bg-sky-400',
    highlightBg: 'bg-sky-300/40 hover:bg-sky-300/60',
    pinBg: 'bg-sky-400 text-sky-950 border-sky-500',
    cardTint: 'border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/25',
  },
  rose: {
    label: 'Pink',
    swatch: 'bg-rose-400',
    highlightBg: 'bg-rose-300/40 hover:bg-rose-300/60',
    pinBg: 'bg-rose-400 text-rose-950 border-rose-500',
    cardTint: 'border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/25',
  },
};

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Invalid PDF data URL.');
  }
  const meta = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  if (meta.includes(';base64')) {
    const binary = window.atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const decoded = decodeURIComponent(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

function mergeLineRects(rawRects: HighlightRect[]): HighlightRect[] {
  const valid = rawRects
    .filter((r) => r.w > 0.002 && r.h > 0.002)
    .map((r) => ({
      x: Number(Math.max(0, Math.min(1, r.x)).toFixed(4)),
      y: Number(Math.max(0, Math.min(1, r.y)).toFixed(4)),
      w: Number(Math.max(0.001, Math.min(1, r.w)).toFixed(4)),
      h: Number(Math.max(0.001, Math.min(1, r.h)).toFixed(4)),
    }));
  if (valid.length <= 1) return valid;

  const sorted = [...valid].sort((a, b) => (Math.abs(a.y - b.y) < 0.008 ? a.x - b.x : a.y - b.y));
  const merged: HighlightRect[] = [];

  for (const rect of sorted) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      Math.abs(prev.y - rect.y) < 0.01 &&
      Math.abs(prev.h - rect.h) < 0.015 &&
      rect.x <= prev.x + prev.w + 0.008
    ) {
      const right = Math.max(prev.x + prev.w, rect.x + rect.w);
      const bottom = Math.max(prev.y + prev.h, rect.y + rect.h);
      prev.y = Number(Math.min(prev.y, rect.y).toFixed(4));
      prev.w = Number((right - prev.x).toFixed(4));
      prev.h = Number((bottom - prev.y).toFixed(4));
    } else {
      merged.push({ ...rect });
    }
  }

  return merged.slice(0, 80);
}

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  toolMode: ToolMode;
  annotations: MaterialAnnotation[];
  activeAnnotationId: string | null;
  pendingSelection: PendingSelection | null;
  pendingStickyDraft: PendingStickyDraft | null;
  scrollRoot: HTMLDivElement | null;
  onSelectAnnotation: (ann: MaterialAnnotation | null) => void;
  onTextSelected: (sel: PendingSelection) => void;
  onPlaceStickyNote: (pageNumber: number, x: number, y: number) => void;
  onCreateHighlightFromSelection: (sel: PendingSelection) => void;
  onStartNoteFromSelection: (sel: PendingSelection) => void;
  onDismissSelection: () => void;
  onSaveDraftNote: () => void;
  onChangeDraftText: (val: string) => void;
  onCancelDraftNote: () => void;
  savingAnnotation: boolean;
  readOnly?: boolean;
  onPageVisible: (pageNumber: number) => void;
  registerPageRef: (pageNumber: number, el: HTMLDivElement | null) => void;
}

function PdfPageView({
  pdfDoc,
  pageNumber,
  scale,
  toolMode,
  annotations,
  activeAnnotationId,
  pendingSelection,
  pendingStickyDraft,
  scrollRoot,
  onSelectAnnotation,
  onTextSelected,
  onPlaceStickyNote,
  onCreateHighlightFromSelection,
  onStartNoteFromSelection,
  onDismissSelection,
  onSaveDraftNote,
  onChangeDraftText,
  onCancelDraftNote,
  savingAnnotation,
  readOnly = false,
  onPageVisible,
  registerPageRef,
}: PdfPageCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(pageNumber <= 2);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: Math.round(612 * scale),
    height: Math.round(792 * scale),
  });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (entry.intersectionRatio >= 0.35) {
              onPageVisible(pageNumber);
            }
          }
        }
      },
      {
        root: scrollRoot,
        rootMargin: '320px 0px',
        threshold: [0.01, 0.35],
      }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, scrollRoot, onPageVisible]);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let textLayerInstance: pdfjsLib.TextLayer | null = null;

    async function renderPage() {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        setDimensions({
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });

        const canvas = canvasRef.current;
        const textContainer = textLayerRef.current;
        if (!canvas || !textContainer) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const task = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        });
        renderTask = task;
        await task.promise;
        if (cancelled) return;

        textContainer.innerHTML = '';
        textContainer.style.setProperty('--total-scale-factor', String(viewport.scale));

        const textContent = await page.getTextContent();
        if (cancelled) return;

        textLayerInstance = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport,
        });
        await textLayerInstance.render();
      } catch (err) {
        if (!cancelled) {
          const name = err instanceof Error ? err.name : '';
          if (name !== 'RenderingCancelledException') {
            console.error(`Failed to render PDF page ${pageNumber}:`, err);
          }
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // Ignore cancellation errors
      }
      try {
        textLayerInstance?.cancel();
      } catch {
        // Ignore cancellation errors
      }
    };
  }, [pdfDoc, pageNumber, scale, inView]);

  const captureCurrentSelection = useCallback(() => {
    if (readOnly || toolMode === 'note') return;
    const selection = window.getSelection();
    const wrapper = wrapperRef.current;
    if (!selection || selection.isCollapsed || !wrapper) return;

    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;

    const range = selection.getRangeAt(0);
    if (!wrapper.contains(range.commonAncestorContainer)) return;

    const pageRect = wrapper.getBoundingClientRect();
    if (pageRect.width <= 0 || pageRect.height <= 0) return;

    const rawClientRects = Array.from(range.getClientRects());
    const normalizedRects = mergeLineRects(
      rawClientRects.map((r) => ({
        x: (r.left - pageRect.left) / pageRect.width,
        y: (r.top - pageRect.top) / pageRect.height,
        w: r.width / pageRect.width,
        h: r.height / pageRect.height,
      }))
    );

    if (normalizedRects.length === 0) return;

    const first = normalizedRects[0];
    const sel: PendingSelection = {
      pageNumber,
      selectedText: clampString(text, 2000),
      rects: normalizedRects,
      anchorX: Math.min(0.82, Math.max(0.18, first.x + first.w / 2)),
      anchorY: Math.max(0.08, first.y),
    };

    if (toolMode === 'highlight') {
      selection.removeAllRanges();
      onCreateHighlightFromSelection(sel);
    } else {
      onTextSelected(sel);
    }
  }, [readOnly, toolMode, pageNumber, onCreateHighlightFromSelection, onTextSelected]);

  // Support mobile long-press text selection alongside desktop mouseup
  useEffect(() => {
    if (readOnly || toolMode === 'note') return;
    let timer: number | null = null;
    const handleSelectionChange = () => {
      const wrapper = wrapperRef.current;
      const sel = window.getSelection();
      if (!wrapper || !sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!wrapper.contains(range.commonAncestorContainer)) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        captureCurrentSelection();
      }, 420);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [readOnly, toolMode, captureCurrentSelection]);

  const handleMouseUp = () => {
    captureCurrentSelection();
  };

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== 'note') return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-annotation-interactive="true"]')) return;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = Number(Math.max(0.04, Math.min(0.95, (e.clientX - rect.left) / rect.width)).toFixed(4));
    const y = Number(Math.max(0.04, Math.min(0.95, (e.clientY - rect.top) / rect.height)).toFixed(4));
    onPlaceStickyNote(pageNumber, x, y);
  };

  const pageHighlights = annotations.filter((a) => a.kind === 'highlight');
  const pageNotes = annotations.filter((a) => a.kind === 'note');
  const activeNoteOnPage = pageNotes.find((n) => n.id === activeAnnotationId) || null;
  const showSelectionHere = pendingSelection && pendingSelection.pageNumber === pageNumber;
  const showDraftHere = pendingStickyDraft && pendingStickyDraft.pageNumber === pageNumber;

  return (
    <div className="flex flex-col items-center">
      <div
        ref={(el) => {
          wrapperRef.current = el;
          registerPageRef(pageNumber, el);
        }}
        onMouseUp={handleMouseUp}
        onTouchEnd={() => {
          window.setTimeout(captureCurrentSelection, 220);
        }}
        onClick={handlePageClick}
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
        }}
        className={`relative select-text overflow-visible rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-700 ${
          !readOnly && toolMode === 'note' ? 'cursor-crosshair' : ''
        }`}
      >
        <canvas ref={canvasRef} className="block rounded-md" />

        {/* Highlight Overlays */}
        <div className="pointer-events-none absolute inset-0 z-[5]">
          {pageHighlights.map((hl) => {
            const palette = COLOR_STYLES[hl.color] || COLOR_STYLES.amber;
            const isActive = hl.id === activeAnnotationId;
            return (
              <React.Fragment key={hl.id}>
                {(hl.rects || []).map((r, idx) => (
                  <button
                    key={`${hl.id}_${idx}`}
                    type="button"
                    data-annotation-interactive="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectAnnotation(isActive ? null : hl);
                    }}
                    title={hl.noteText || hl.selectedText || 'Highlight'}
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                    }}
                    className={`pointer-events-auto absolute rounded-[2px] transition-colors ${palette.highlightBg} ${
                      isActive ? 'ring-2 ring-blue-600 ring-offset-1' : ''
                    }`}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </div>

        {/* Text Layer for real PDF selection */}
        <div
          ref={textLayerRef}
          className={`pdf-text-layer ${toolMode === 'note' ? 'pointer-events-none' : ''}`}
        />

        {/* Sticky Note Pins */}
        <div className="pointer-events-none absolute inset-0 z-20">
          {pageNotes.map((note, idx) => {
            const palette = COLOR_STYLES[note.color] || COLOR_STYLES.amber;
            const isActive = note.id === activeAnnotationId;
            const leftPct = Math.max(2, Math.min(94, (note.x ?? 0.5) * 100));
            const topPct = Math.max(2, Math.min(94, (note.y ?? 0.5) * 100));
            return (
              <button
                key={note.id}
                type="button"
                data-annotation-interactive="true"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation(isActive ? null : note);
                }}
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md border shadow-md transition-transform hover:scale-110 ${palette.pinBg} ${
                  isActive ? 'ring-2 ring-blue-600 ring-offset-1' : ''
                }`}
                title={note.noteText || 'View sticky note'}
              >
                <span className="font-mono text-[11px] font-bold tabular-nums">{idx + 1}</span>
              </button>
            );
          })}

          {/* Active Sticky Note Preview Popover */}
          {activeNoteOnPage && (
            <div
              data-annotation-interactive="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                left: `${Math.min(72, Math.max(24, (activeNoteOnPage.x ?? 0.5) * 100))}%`,
                top: `${Math.min(76, Math.max(12, (activeNoteOnPage.y ?? 0.5) * 100 + 5))}%`,
              }}
              className="pointer-events-auto absolute z-30 w-60 -translate-x-1/2 rounded-lg border border-slate-300 bg-white p-3 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 dark:border-slate-800">
                <span className="font-display text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Sticky Note · Page {pageNumber}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectAnnotation(null)}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 dark:text-slate-200">
                {activeNoteOnPage.noteText || 'Empty sticky note'}
              </p>
            </div>
          )}

          {/* Selection Floating Quick Bar */}
          {showSelectionHere && (
            <div
              data-annotation-interactive="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                left: `${pendingSelection.anchorX * 100}%`,
                top: `${Math.max(4, pendingSelection.anchorY * 100 - 2)}%`,
              }}
              className="pointer-events-auto absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-900 px-2 py-1.5 text-xs text-white shadow-lg dark:border-slate-700"
            >
              <button
                type="button"
                disabled={savingAnnotation}
                onClick={() => onCreateHighlightFromSelection(pendingSelection)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium hover:bg-slate-800 whitespace-nowrap"
              >
                <Highlighter className="h-3 w-3 text-amber-300" />
                Highlight
              </button>
              <button
                type="button"
                disabled={savingAnnotation}
                onClick={() => onStartNoteFromSelection(pendingSelection)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium hover:bg-slate-800 whitespace-nowrap"
              >
                <StickyNote className="h-3 w-3 text-sky-300" />
                Highlight &amp; Note
              </button>
              <button
                type="button"
                onClick={onDismissSelection}
                className="rounded p-1 text-slate-400 hover:text-white"
                title="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Draft Sticky Note Composer Popover */}
          {showDraftHere && (
            <div
              data-annotation-interactive="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                left: `${Math.min(72, Math.max(24, pendingStickyDraft.x * 100))}%`,
                top: `${Math.min(70, Math.max(10, pendingStickyDraft.y * 100))}%`,
              }}
              className="pointer-events-auto absolute z-30 w-64 -translate-x-1/2 rounded-lg border border-slate-300 bg-white p-3 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                  {pendingStickyDraft.selectedText ? 'Note on Highlight' : `New Sticky Note · Page ${pageNumber}`}
                </span>
                <button
                  type="button"
                  onClick={onCancelDraftNote}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {pendingStickyDraft.selectedText && (
                <p className="mt-1.5 line-clamp-2 rounded bg-slate-100 px-2 py-1 text-[11px] italic text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  “{pendingStickyDraft.selectedText}”
                </p>
              )}
              <textarea
                rows={3}
                autoFocus
                value={pendingStickyDraft.noteText}
                onChange={(e) => onChangeDraftText(e.target.value)}
                placeholder="Write a study reminder, formula note, or exam tip..."
                className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={onCancelDraftNote}
                  className="rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingAnnotation || !pendingStickyDraft.noteText.trim()}
                  onClick={onSaveDraftNote}
                  className="rounded-md bg-blue-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {savingAnnotation ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <span className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
        Page {pageNumber}
      </span>
    </div>
  );
}

export function PdfAnnotator({ dataUrl, materialId, fileName, readOnly = false }: PdfAnnotatorProps) {
  const { user } = useAuth();
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 0.58 : 1.05
  );
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [activeColor, setActiveColor] = useState<AnnotationColor>('amber');
  const [annotations, setAnnotations] = useState<MaterialAnnotation[]>([]);
  const [sidebarFilter, setSidebarFilter] = useState<'all' | 'highlight' | 'note'>('all');
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [pendingStickyDraft, setPendingStickyDraft] = useState<PendingStickyDraft | null>(null);
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Load PDF document via pdfjs-dist
  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    setLoadingPdf(true);
    setPdfError(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);

    async function load() {
      try {
        const bytes = dataUrlToUint8Array(dataUrl);
        loadingTask = pdfjsLib.getDocument({ data: bytes });
        const docProxy = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdfDoc(docProxy);
        setNumPages(docProxy.numPages);
      } catch (err) {
        if (!cancelled) {
          setPdfError(
            err instanceof Error
              ? `Could not render PDF (${err.message}). Try downloading the file instead.`
              : 'Could not render this PDF file.'
          );
        }
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [dataUrl]);

  // Subscribe to this user's annotations on the selected study material
  useEffect(() => {
    if (readOnly || !user || !materialId) {
      setAnnotations([]);
      return;
    }
    const q = query(
      collection(db, 'studyMaterials', materialId, 'annotations'),
      where('authorId', '==', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as MaterialAnnotation))
          .sort((a, b) => {
            if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
            return getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt);
          });
        setAnnotations(docs);
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `studyMaterials/${materialId}/annotations`
        )
    );
    return () => unsub();
  }, [readOnly, user, materialId]);

  const registerPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    pageRefs.current[pageNum] = el;
  }, []);

  const handlePageVisible = useCallback((pageNum: number) => {
    setCurrentPage(pageNum);
  }, []);

  const scrollToPage = useCallback(
    (pageNum: number) => {
      const clamped = Math.max(1, Math.min(numPages || 1, pageNum));
      setCurrentPage(clamped);
      const target = pageRefs.current[clamped];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [numPages]
  );

  const handleCreateHighlight = async (sel: PendingSelection, noteText?: string) => {
    if (!user) return;
    setSavingAnnotation(true);
    try {
      const payload: Record<string, unknown> = {
        authorId: user.uid,
        materialId,
        kind: 'highlight',
        pageNumber: sel.pageNumber,
        color: activeColor,
        selectedText: clampString(sel.selectedText, 2000),
        rects: sel.rects.slice(0, 80),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (noteText?.trim()) {
        payload.noteText = clampString(noteText, 2000);
      }
      const ref = await addDoc(
        collection(db, 'studyMaterials', materialId, 'annotations'),
        payload
      );
      setActiveAnnotationId(ref.id);
      setPendingSelection(null);
      setPendingStickyDraft(null);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `studyMaterials/${materialId}/annotations`
      );
    } finally {
      setSavingAnnotation(false);
    }
  };

  const handlePlaceStickyNote = (pageNumber: number, x: number, y: number) => {
    setPendingSelection(null);
    setActiveAnnotationId(null);
    setPendingStickyDraft({
      pageNumber,
      x,
      y,
      noteText: '',
    });
  };

  const handleSaveDraftNote = async () => {
    if (!user || !pendingStickyDraft || !pendingStickyDraft.noteText.trim()) return;

    // If attached to a text selection, save as a highlight with noteText
    if (pendingStickyDraft.highlightRects && pendingStickyDraft.selectedText) {
      await handleCreateHighlight(
        {
          pageNumber: pendingStickyDraft.pageNumber,
          selectedText: pendingStickyDraft.selectedText,
          rects: pendingStickyDraft.highlightRects,
          anchorX: pendingStickyDraft.x,
          anchorY: pendingStickyDraft.y,
        },
        pendingStickyDraft.noteText
      );
      return;
    }

    setSavingAnnotation(true);
    try {
      const ref = await addDoc(
        collection(db, 'studyMaterials', materialId, 'annotations'),
        {
          authorId: user.uid,
          materialId,
          kind: 'note',
          pageNumber: pendingStickyDraft.pageNumber,
          color: activeColor,
          noteText: clampString(pendingStickyDraft.noteText, 2000),
          x: pendingStickyDraft.x,
          y: pendingStickyDraft.y,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );
      setActiveAnnotationId(ref.id);
      setPendingStickyDraft(null);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `studyMaterials/${materialId}/annotations`
      );
    } finally {
      setSavingAnnotation(false);
    }
  };

  const handleUpdateNoteText = async (ann: MaterialAnnotation) => {
    if (!user) return;
    const clean = clampString(editingText, 2000);
    if (ann.kind === 'note' && !clean) return;
    try {
      await updateDoc(doc(db, 'studyMaterials', materialId, 'annotations', ann.id), {
        noteText: clean,
        updatedAt: serverTimestamp(),
      });
      setEditingId(null);
      setEditingText('');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `studyMaterials/${materialId}/annotations/${ann.id}`
      );
    }
  };

  const handleDeleteAnnotation = async (annId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'studyMaterials', materialId, 'annotations', annId));
      if (activeAnnotationId === annId) setActiveAnnotationId(null);
      if (editingId === annId) setEditingId(null);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `studyMaterials/${materialId}/annotations/${annId}`
      );
    }
  };

  const filteredAnnotations = useMemo(() => {
    if (sidebarFilter === 'all') return annotations;
    return annotations.filter((a) => a.kind === sidebarFilter);
  }, [annotations, sidebarFilter]);

  const highlightCount = annotations.filter((a) => a.kind === 'highlight').length;
  const noteCount = annotations.filter((a) => a.kind === 'note').length;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4 dark:border-slate-800 dark:bg-slate-950">
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setToolMode('select');
                  setPendingStickyDraft(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  toolMode === 'select'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <MousePointer className="h-3.5 w-3.5" />
                Select
              </button>
              <button
                type="button"
                onClick={() => {
                  setToolMode('highlight');
                  setPendingStickyDraft(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  toolMode === 'highlight'
                    ? 'bg-amber-400 text-amber-950'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <Highlighter className="h-3.5 w-3.5" />
                Highlight
              </button>
              <button
                type="button"
                onClick={() => {
                  setToolMode('note');
                  setPendingSelection(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  toolMode === 'note'
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <StickyNote className="h-3.5 w-3.5" />
                Sticky Note
              </button>
            </div>

            {/* Color Swatches */}
            <div className="flex items-center gap-1.5 pl-1" role="group" aria-label="Annotation color">
              {(Object.keys(COLOR_STYLES) as AnnotationColor[]).map((colorKey) => {
                const item = COLOR_STYLES[colorKey];
                const active = activeColor === colorKey;
                return (
                  <button
                    key={colorKey}
                    type="button"
                    onClick={() => setActiveColor(colorKey)}
                    title={`${item.label} color`}
                    aria-label={`${item.label} annotation color`}
                    className={`h-5 w-5 rounded-full transition-transform ${item.swatch} ${
                      active
                        ? 'scale-110 ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-950'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            PDF Paper Reader
          </div>
        )}

        {/* Page Navigation & Zoom */}
        <div className="flex flex-wrap items-center gap-3">
          {numPages > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => scrollToPage(currentPage - 1)}
                className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                title="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 font-mono text-xs text-slate-700 tabular-nums dark:text-slate-300">
                {currentPage} / {numPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= numPages}
                onClick={() => scrollToPage(currentPage + 1)}
                className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                title="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 border-l border-slate-200 pl-3 dark:border-slate-800">
            <button
              type="button"
              disabled={scale <= 0.5}
              onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.15).toFixed(2))))}
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-12 text-center font-mono text-xs text-slate-700 tabular-nums dark:text-slate-300">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              disabled={scale >= 2.0}
              onClick={() => setScale((s) => Math.min(2.0, Number((s + 0.15).toFixed(2))))}
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mode Hint Strip */}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <span>
            {toolMode === 'highlight'
              ? 'Select or drag over any text on the slides to highlight it immediately.'
              : toolMode === 'note'
              ? 'Tap or click anywhere on a slide to pin a sticky note.'
              : 'Select or long-press text on any slide to highlight or attach a note.'}
          </span>
          {fileName && <span className="truncate font-mono">{fileName}</span>}
        </div>
      )}

      {/* Main Split Workspace: PDF Canvas + Annotations Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* PDF Scroll Canvas */}
        <div
          ref={scrollContainerRef}
          className={`max-h-[62vh] overflow-auto bg-slate-100 p-3 sm:p-5 dark:bg-slate-950 ${
            readOnly ? 'lg:col-span-12' : 'lg:col-span-8'
          }`}
        >
          {loadingPdf ? (
            <div className="space-y-4 py-8">
              <div className="skeleton-shimmer mx-auto h-72 max-w-lg rounded-lg" />
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Rendering PDF pages...
              </p>
            </div>
          ) : pdfError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {pdfError}
            </div>
          ) : pdfDoc ? (
            <div className="space-y-6">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <PdfPageView
                  key={pageNum}
                  pdfDoc={pdfDoc}
                  pageNumber={pageNum}
                  scale={scale}
                  toolMode={toolMode}
                  annotations={annotations.filter((a) => a.pageNumber === pageNum)}
                  activeAnnotationId={activeAnnotationId}
                  pendingSelection={pendingSelection}
                  pendingStickyDraft={pendingStickyDraft}
                  scrollRoot={scrollContainerRef.current}
                  onSelectAnnotation={(ann) => setActiveAnnotationId(ann ? ann.id : null)}
                  onTextSelected={(sel) => {
                    setPendingStickyDraft(null);
                    setPendingSelection(sel);
                  }}
                  onPlaceStickyNote={handlePlaceStickyNote}
                  onCreateHighlightFromSelection={(sel) => void handleCreateHighlight(sel)}
                  onStartNoteFromSelection={(sel) => {
                    setPendingSelection(null);
                    setPendingStickyDraft({
                      pageNumber: sel.pageNumber,
                      x: sel.anchorX,
                      y: sel.anchorY,
                      noteText: '',
                      highlightRects: sel.rects,
                      selectedText: sel.selectedText,
                    });
                  }}
                  onDismissSelection={() => setPendingSelection(null)}
                  onSaveDraftNote={() => void handleSaveDraftNote()}
                  onChangeDraftText={(val) =>
                    setPendingStickyDraft((prev) => (prev ? { ...prev, noteText: val } : prev))
                  }
                  onCancelDraftNote={() => setPendingStickyDraft(null)}
                  savingAnnotation={savingAnnotation}
                  readOnly={readOnly}
                  onPageVisible={handlePageVisible}
                  registerPageRef={registerPageRef}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* Annotations Sidebar */}
        {!readOnly && (
        <div className="flex max-h-[62vh] flex-col border-t border-slate-200 bg-white lg:col-span-4 lg:border-t-0 lg:border-l dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
                My Highlights &amp; Notes
              </h3>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                {highlightCount} highlights · {noteCount} notes
              </span>
            </div>
            <div className="mt-2.5">
              <SegmentedTabs
                layoutGroup="pdf-annotations-filter"
                size="xs"
                fullWidth
                value={sidebarFilter}
                onChange={setSidebarFilter}
                options={[
                  { id: 'all', label: `All (${annotations.length})` },
                  { id: 'highlight', label: `Highlights (${highlightCount})` },
                  { id: 'note', label: `Notes (${noteCount})` },
                ]}
              />
            </div>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {filteredAnnotations.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                {annotations.length === 0
                  ? 'Highlight text or drop sticky notes on any slide to save personal study annotations here.'
                  : 'No annotations match this filter.'}
              </div>
            ) : (
              filteredAnnotations.map((ann) => {
                const palette = COLOR_STYLES[ann.color] || COLOR_STYLES.amber;
                const isActive = activeAnnotationId === ann.id;
                const isEditing = editingId === ann.id;

                return (
                  <div
                    key={ann.id}
                    onClick={() => {
                      setActiveAnnotationId(ann.id);
                      scrollToPage(ann.pageNumber);
                    }}
                    className={`cursor-pointer rounded-lg border p-3 text-xs transition-colors ${palette.cardTint} ${
                      isActive ? 'ring-2 ring-blue-600/70' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        <span className={`h-2 w-2 rounded-full ${palette.swatch}`} />
                        <span>{ann.kind === 'highlight' ? 'Highlight' : 'Sticky Note'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Page {ann.pageNumber}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatTimestamp(ann.createdAt)}</span>
                      </div>

                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(ann.id);
                            setEditingText(ann.noteText || '');
                          }}
                          className="rounded p-1 text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                          title={ann.noteText ? 'Edit note' : 'Add note'}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAnnotation(ann.id)}
                          className="rounded p-1 text-slate-500 hover:bg-white/70 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800"
                          title="Delete annotation"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {ann.selectedText && (
                      <p className="mt-2 line-clamp-3 text-xs italic leading-relaxed text-slate-700 dark:text-slate-300">
                        “{ann.selectedText}”
                      </p>
                    )}

                    {isEditing ? (
                      <div
                        className="mt-2 space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <textarea
                          rows={2}
                          autoFocus
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          placeholder="Add or edit note..."
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded px-2 py-1 text-[11px] text-slate-600 hover:bg-white/80 dark:text-slate-300"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUpdateNoteText(ann)}
                            className="rounded bg-blue-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-800"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      ann.noteText && (
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-900 dark:text-slate-100">
                          {ann.noteText}
                        </p>
                      )
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
