import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { BookOpen, Bookmark, Check, Download, ExternalLink, MessageSquare, Plus, Search, Share2, Sparkles, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { LecturerAcknowledgement } from '../components/LecturerAcknowledgement';
import { MarkdownView } from '../components/MarkdownView';
import { AiErrorBanner, ModalShell, SegmentedTabs } from '../components/MotionPrimitives';
import { PdfAnnotator } from '../components/PdfAnnotator';
import { ShareToPeerModal } from '../components/ShareToPeerModal';
import { useAuth } from '../context/AuthContext';
import { useBookmarks } from '../lib/bookmarks';
import { db, handleFirestoreError, handleSnapshotError, OperationType } from '../lib/firebase';
import { deleteFileChunks, loadAttachmentDataUrl, splitDataUrlIntoChunks, uploadFileChunks } from '../lib/fileChunks';
import { downloadNotesAsHtml, downloadNotesAsMarkdown } from '../lib/notesExport';
import { clampString, formatFileSize, formatTimestamp, getTimestampMillis, isPdfAttachment, MAX_INLINE_DATA_URL_CHARS, normalizeCourseCode, parseAiResponse, readStudyFile } from '../lib/utils';
import type { MaterialTypeOption, MaterialVisibility, StudyMaterial } from '../types';
import type { StudioPrefill } from './PastQuestionsPage';

interface StudyMaterialsPageProps {
  initialMaterialId?: string | null;
  onClearInitialMaterial?: () => void;
  onMessageAuthor?: (authorUid: string) => void;
  onSendToAIStudio: (prefill: StudioPrefill) => void;
}

export function StudyMaterialsPage({
  initialMaterialId,
  onClearInitialMaterial,
  onMessageAuthor,
  onSendToAIStudio,
}: StudyMaterialsPageProps) {
  const { user, profile, updateProfileData } = useAuth();
  const { bookmarkedMaterialIds, toggleBookmark, isBookmarked } = useBookmarks(user?.uid);
  const [sharedMaterials, setSharedMaterials] = useState<StudyMaterial[]>([]);
  const [myPrivateMaterials, setMyPrivateMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'peers' | 'my-courses' | 'saved' | 'mine'>('all');
  const [courseFilter, setCourseFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [materialType, setMaterialType] = useState<MaterialTypeOption>('Notes');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentText, setContentText] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [visibility, setVisibility] = useState<MaterialVisibility>('course');
  const [fileName, setFileName] = useState('');
  const [fileMimeType, setFileMimeType] = useState('');
  const [fileDataUrl, setFileDataUrl] = useState('');
  const [fileSizeBytes, setFileSizeBytes] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reader modal state
  const [selected, setSelected] = useState<StudyMaterial | null>(null);
  const [loadedFileDataUrl, setLoadedFileDataUrl] = useState('');
  const [loadingAttachment, setLoadingAttachment] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<StudyMaterial | null>(null);

  useEffect(() => {
    if (!user) return;
    const sharedQ = query(
      collection(db, 'studyMaterials'),
      where('visibility', 'in', ['course', 'public'])
    );
    const unsubShared = onSnapshot(
      sharedQ,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as StudyMaterial))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setSharedMaterials(docs);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleSnapshotError(err, OperationType.LIST, 'studyMaterials');
      }
    );

    const mineQ = query(
      collection(db, 'studyMaterials'),
      where('authorId', '==', user.uid)
    );
    const unsubPriv = onSnapshot(
      mineQ,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as StudyMaterial))
          .filter((m) => m.visibility === 'private')
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setMyPrivateMaterials(docs);
      },
      (err) => handleSnapshotError(err, OperationType.LIST, 'studyMaterials')
    );

    return () => {
      unsubShared();
      unsubPriv();
    };
  }, [user]);

  useEffect(() => {
    if (!selected) {
      setLoadedFileDataUrl('');
      setLoadingAttachment(false);
      return;
    }
    let cancelled = false;
    if (selected.fileDataUrl) {
      setLoadedFileDataUrl(selected.fileDataUrl);
      setLoadingAttachment(false);
    } else if (selected.fileChunkCount && selected.fileChunkCount > 0) {
      setLoadedFileDataUrl('');
      setLoadingAttachment(true);
      void loadAttachmentDataUrl('studyMaterials', selected.id, {
        inlineDataUrl: selected.fileDataUrl,
        chunkCount: selected.fileChunkCount,
        isPubliclyReadable: selected.visibility !== 'private',
        currentUserId: user?.uid,
        authorId: selected.authorId,
      })
        .then((url) => {
          if (!cancelled) setLoadedFileDataUrl(url);
        })
        .finally(() => {
          if (!cancelled) setLoadingAttachment(false);
        });
    } else {
      setLoadedFileDataUrl('');
      setLoadingAttachment(false);
    }
    return () => {
      cancelled = true;
    };
  }, [selected, user?.uid]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    try {
      const parsed = await readStudyFile(file);
      setFileName(parsed.fileName);
      setFileMimeType(parsed.fileMimeType);
      setFileSizeBytes(parsed.fileSizeBytes);
      if (parsed.extractedText) {
        setContentText((prev) => (prev ? `${prev}\n\n${parsed.extractedText}` : parsed.extractedText!));
        setFileDataUrl(parsed.fileDataUrl || '');
      } else if (parsed.fileDataUrl) {
        setFileDataUrl(parsed.fileDataUrl);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to parse selected file.');
    }
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const normCode = normalizeCourseCode(courseCode);
    if (!normCode || normCode.length < 2) {
      setUploadError('Enter a valid course code (e.g., ECON202).');
      return;
    }
    if (!contentText.trim() && !fileDataUrl && !externalUrl.trim()) {
      setUploadError('Provide study notes text, attach a file, or add a slide deck URL.');
      return;
    }

    setSubmitting(true);
    setUploadError(null);
    setUploadProgress(null);
    try {
      const needsChunking = Boolean(fileDataUrl && fileDataUrl.length > MAX_INLINE_DATA_URL_CHARS);
      const plannedChunkCount = needsChunking ? splitDataUrlIntoChunks(fileDataUrl).length : 0;

      const payload: Record<string, unknown> = {
        authorId: user.uid,
        authorName: clampString(profile?.displayName || user.displayName || 'Student', 120),
        courseCode: normCode,
        courseTitle: clampString(courseTitle || normCode, 150),
        materialType,
        title: clampString(title, 180),
        contentText: clampString(contentText || `Uploaded resource: ${fileName || externalUrl}`, 60000),
        visibility,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (description.trim()) payload.description = clampString(description, 1000);
      if (fileName) payload.fileName = clampString(fileName, 180);
      if (fileMimeType) payload.fileMimeType = clampString(fileMimeType, 100);
      if (fileSizeBytes > 0) payload.fileSizeBytes = fileSizeBytes;
      if (needsChunking) {
        payload.fileChunkCount = plannedChunkCount;
      } else if (fileDataUrl) {
        payload.fileDataUrl = fileDataUrl;
      }
      if (externalUrl.trim()) payload.externalUrl = clampString(externalUrl, 500);

      const docRef = await addDoc(collection(db, 'studyMaterials'), payload);

      if (needsChunking && fileDataUrl) {
        await uploadFileChunks(
          'studyMaterials',
          docRef.id,
          fileDataUrl,
          user.uid,
          visibility !== 'private',
          (done, total) => {
            setUploadProgress(`Uploading attachment (${done}/${total})...`);
          }
        );
      }

      setShowUpload(false);
      setCourseCode('');
      setCourseTitle('');
      setTitle('');
      setDescription('');
      setContentText('');
      setExternalUrl('');
      setFileName('');
      setFileMimeType('');
      setFileDataUrl('');
      setFileSizeBytes(0);
      setUploadProgress(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload study material.');
      handleFirestoreError(err, OperationType.CREATE, 'studyMaterials');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSummarizeMaterial = async (mat: StudyMaterial) => {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const attachmentUrl =
        loadedFileDataUrl ||
        (await loadAttachmentDataUrl('studyMaterials', mat.id, {
          inlineDataUrl: mat.fileDataUrl,
          chunkCount: mat.fileChunkCount,
          isPubliclyReadable: mat.visibility !== 'private',
          currentUserId: user?.uid,
          authorId: mat.authorId,
        }));
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: mat.title,
          courseCode: mat.courseCode,
          contentText: mat.contentText,
          fileDataUrl: attachmentUrl || undefined,
          fileMimeType: mat.fileMimeType,
          fileName: mat.fileName,
          focusMode: 'standard',
        }),
      });
      const data = await parseAiResponse<{ summary?: string }>(res, 'Failed to summarize.');
      const generated = clampString(data.summary || '', 15000);
      setPreviewSummary(generated);

      if (user && mat.authorId === user.uid) {
        await updateDoc(doc(db, 'studyMaterials', mat.id), {
          aiSummary: generated,
          updatedAt: serverTimestamp(),
        });
        setSelected((prev) => (prev ? { ...prev, aiSummary: generated } : prev));
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'AI summarization failed.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleDelete = async (mat: StudyMaterial) => {
    if (!user || mat.authorId !== user.uid) return;
    try {
      await deleteFileChunks('studyMaterials', mat.id, user.uid, mat.fileChunkCount);
      await deleteDoc(doc(db, 'studyMaterials', mat.id));
      if (selected?.id === mat.id) setSelected(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studyMaterials/${mat.id}`);
    }
  };

  const mergedMaterials = [...myPrivateMaterials, ...sharedMaterials].sort(
    (a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
  );
  const myCourses = profile?.courses || [];
  const availableCourses = Array.from(new Set(mergedMaterials.map((m) => m.courseCode))).sort();

  useEffect(() => {
    if (!initialMaterialId || mergedMaterials.length === 0) return;
    const found = mergedMaterials.find((m) => m.id === initialMaterialId);
    if (found) {
      setSelected(found);
      setPreviewSummary(found.aiSummary || null);
      setSummaryError(null);
      onClearInitialMaterial?.();
    }
  }, [initialMaterialId, mergedMaterials, onClearInitialMaterial]);

  const handleFollowCourse = async (code: string) => {
    if (!code || myCourses.includes(code) || myCourses.length >= 15) return;
    await updateProfileData({ courses: [...myCourses, code] });
  };

  const filtered = mergedMaterials.filter((m) => {
    if (scope === 'mine' && m.authorId !== user?.uid) return false;
    if (scope === 'peers' && m.authorId === user?.uid) return false;
    if (scope === 'saved' && !bookmarkedMaterialIds.includes(m.id)) return false;
    if (scope === 'my-courses' && myCourses.length > 0 && !myCourses.includes(m.courseCode)) return false;
    if (courseFilter !== 'ALL' && m.courseCode !== courseFilter) return false;
    if (typeFilter !== 'ALL' && m.materialType !== typeFilter) return false;
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      m.courseCode.toLowerCase().includes(s) ||
      m.courseTitle.toLowerCase().includes(s) ||
      m.title.toLowerCase().includes(s) ||
      m.authorName.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Study Materials &amp; Notes Library
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Access lecture notes, slides, and cheat sheets shared across courses, or upload your own.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Upload Notes / Slides
        </button>
      </div>

      <LecturerAcknowledgement />

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedTabs
          layoutGroup="study-materials-scope"
          value={scope}
          onChange={setScope}
          options={[
            { id: 'all', label: 'All Materials' },
            { id: 'peers', label: 'From Students' },
            { id: 'my-courses', label: 'My Courses' },
            { id: 'saved', label: `Saved (${bookmarkedMaterialIds.length})` },
            { id: 'mine', label: 'My Uploads' },
          ]}
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search course, topic, author..."
              className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Courses</option>
            {availableCourses.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Types</option>
            <option value="Notes">Lecture Notes</option>
            <option value="Slides">Lecture Slides</option>
            <option value="Cheat Sheet">Cheat Sheet</option>
            <option value="Lab Guide">Lab Guide</option>
            <option value="Reading">Reading Summary</option>
          </select>
        </div>
      </div>

      {/* Materials Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="skeleton-shimmer h-44 rounded-xl border border-slate-200 p-5 dark:border-slate-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <BookOpen className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            No study materials found
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Upload lecture notes, slides, or lab guides to build your course library and share with peers.
          </p>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Upload Material
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mat) => (
            <div
              key={mat.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                    {mat.courseCode}
                  </span>
                  <span>
                    {mat.materialType}
                    {mat.visibility === 'private' ? ' · Private' : ''}
                  </span>
                </div>

                <h3 className="mt-2 font-display text-base font-semibold text-slate-900 line-clamp-2 dark:text-slate-100">
                  {mat.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 truncate dark:text-slate-400">
                  {mat.courseTitle}
                </p>

                <p className="mt-3 text-xs leading-relaxed text-slate-600 line-clamp-3 dark:text-slate-300">
                  {mat.description || mat.contentText}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {mat.authorName} · {formatTimestamp(mat.createdAt)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleBookmark('materials', mat.id)}
                    className={`rounded-md p-1.5 transition-colors ${
                      isBookmarked('materials', mat.id)
                        ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400'
                        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                    }`}
                    title={isBookmarked('materials', mat.id) ? 'Remove bookmark' : 'Save for quick revision'}
                    aria-label={isBookmarked('materials', mat.id) ? 'Remove bookmark' : 'Save material'}
                  >
                    <Bookmark className={`h-3.5 w-3.5 ${isBookmarked('materials', mat.id) ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareTarget(mat)}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    title="Share material"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(mat);
                      setPreviewSummary(mat.aiSummary || null);
                      setSummaryError(null);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Study &amp; AI
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Material Modal */}
      <ModalShell open={showUpload} onClose={() => setShowUpload(false)} maxWidthClass="max-w-2xl">
        <div className="max-h-[90vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Upload Notes, Slides or Study Material
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Shareable with students reading the same course or kept private for personal AI revision.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMaterial} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Course Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                    placeholder="e.g. BIO105"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 uppercase focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Course Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={courseTitle}
                    onChange={(e) => setCourseTitle(e.target.value)}
                    placeholder="e.g. Cell & Molecular Biology"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Material Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Week 4 Lecture Slides — Cellular Respiration"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Material Type
                  </label>
                  <select
                    value={materialType}
                    onChange={(e) => setMaterialType(e.target.value as MaterialTypeOption)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="Notes">Notes</option>
                    <option value="Slides">Slides</option>
                    <option value="Cheat Sheet">Cheat Sheet</option>
                    <option value="Lab Guide">Lab Guide</option>
                    <option value="Reading">Reading</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Visibility
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as MaterialVisibility)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="course">Shared with Course Peers</option>
                    <option value="public">Public Campus Library</option>
                    <option value="private">Private (Only Me)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    External Slides / Resource Link (optional)
                  </label>
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Upload Notes/Slides File (.pdf, .ppt/.pptx, .doc/.docx, .txt, .md, image up to 100 MB)
                  </label>
                  {fileName && (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Attached: {fileName}
                      {fileSizeBytes > 0 ? ` (${formatFileSize(fileSizeBytes)})` : ''}
                    </span>
                  )}
                </div>
                <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Upload className="h-4 w-4 shrink-0" />
                  <span>Choose document, slides, PDF, or image (max 100 MB)</span>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  On Android &amp; Samsung phones, tap Files / Documents / Drive to pick PDFs, slides, or Word files.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Lecturer Credit / Short Description (optional)
                </label>
                <input
                  type="text"
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Lecture slides provided by Dr. Mensah — Week 4 Cellular Respiration..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notes / Slide Content (Markdown supported)
                </label>
                <textarea
                  rows={6}
                  value={contentText}
                  onChange={(e) => setContentText(e.target.value)}
                  placeholder="Paste lecture notes, key definitions, or slide outlines..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {uploadProgress && (
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400">{uploadProgress}</p>
              )}

              {uploadError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">{uploadError}</p>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {submitting ? uploadProgress || 'Saving...' : 'Publish Material'}
                </button>
              </div>
            </form>
          </div>
      </ModalShell>

      {/* Reader Modal */}
      {(() => {
        const isPdfDoc = Boolean(
          selected &&
            isPdfAttachment({
              fileMimeType: selected.fileMimeType,
              fileName: selected.fileName,
              dataUrl: loadedFileDataUrl,
            })
        );
        const isSyntheticUploadPlaceholder =
          isPdfDoc &&
          Boolean(selected?.contentText?.trim().startsWith('Uploaded resource:'));

        return (
          <ModalShell
            open={Boolean(selected)}
            onClose={() => setSelected(null)}
            maxWidthClass={isPdfDoc ? 'max-w-6xl' : 'max-w-3xl'}
          >
            {selected && (
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                    {selected.courseCode}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selected.courseTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selected.materialType}</span>
                </div>
                <h2 className="mt-1.5 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                  {selected.title}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Uploaded by {selected.authorName} · {formatTimestamp(selected.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleSummarizeMaterial(selected)}
                disabled={summarizing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {summarizing ? 'Summarizing...' : previewSummary ? 'Regenerate AI Summary' : 'Summarize with AI'}
              </button>

              <button
                type="button"
                onClick={() =>
                  onSendToAIStudio({
                    title: selected.title,
                    courseCode: selected.courseCode,
                    contentText: selected.contentText,
                    fileDataUrl: loadedFileDataUrl || selected.fileDataUrl,
                    fileMimeType: selected.fileMimeType,
                    fileName: selected.fileName,
                    fileSizeBytes: selected.fileSizeBytes,
                    initialMode: 'quiz',
                  })
                }
                disabled={loadingAttachment}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Generate Retention Quiz
              </button>

              <button
                type="button"
                onClick={() =>
                  onSendToAIStudio({
                    title: selected.title,
                    courseCode: selected.courseCode,
                    contentText: selected.contentText,
                    fileDataUrl: loadedFileDataUrl || selected.fileDataUrl,
                    fileMimeType: selected.fileMimeType,
                    fileName: selected.fileName,
                    fileSizeBytes: selected.fileSizeBytes,
                    initialMode: 'flashcards',
                  })
                }
                disabled={loadingAttachment}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Create Flashcards
              </button>

              <button
                type="button"
                onClick={() => toggleBookmark('materials', selected.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium whitespace-nowrap ${
                  isBookmarked('materials', selected.id)
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <Bookmark className={`h-3.5 w-3.5 ${isBookmarked('materials', selected.id) ? 'fill-current' : ''}`} />
                {isBookmarked('materials', selected.id) ? 'Saved' : 'Save'}
              </button>

              <button
                type="button"
                onClick={() => setShareTarget(selected)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>

              {loadedFileDataUrl && (
                <a
                  href={loadedFileDataUrl}
                  download={selected.fileName || `${selected.courseCode}_material`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download{selected.fileSizeBytes ? ` (${formatFileSize(selected.fileSizeBytes)})` : ''}
                </a>
              )}

              {selected.externalUrl && (
                <a
                  href={selected.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  External Link
                </a>
              )}

              {selected.authorId !== user?.uid && onMessageAuthor && (
                <button
                  type="button"
                  onClick={() => onMessageAuthor(selected.authorId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message {selected.authorName.split(' ')[0]}
                </button>
              )}

              {!myCourses.includes(selected.courseCode) ? (
                <button
                  type="button"
                  onClick={() => void handleFollowCourse(selected.courseCode)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Follow {selected.courseCode}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  In My Courses
                </span>
              )}

              {selected.authorId === user?.uid && (
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap dark:border-red-900/50 dark:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>

            {summaryError && (
              <div className="mt-3">
                <AiErrorBanner
                  message={summaryError}
                  retrying={summarizing}
                  onRetry={() => void handleSummarizeMaterial(selected)}
                />
              </div>
            )}

            {previewSummary && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    AI Study Summary
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        downloadNotesAsHtml({
                          title: selected.title,
                          courseCode: selected.courseCode,
                          subtitle: 'AI Study Summary',
                          markdownContent: previewSummary,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Download className="h-3 w-3" />
                      Download HTML
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadNotesAsMarkdown({
                          title: selected.title,
                          courseCode: selected.courseCode,
                          subtitle: 'AI Study Summary',
                          markdownContent: previewSummary,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Download className="h-3 w-3" />
                      .MD
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <MarkdownView content={previewSummary} />
                </div>
              </div>
            )}

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
              {!isSyntheticUploadPlaceholder && <MarkdownView content={selected.contentText} />}

              {loadingAttachment && (
                <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Loading attachment ({selected.fileName || 'file'})...
                </p>
              )}

              {loadedFileDataUrl && selected.fileMimeType?.startsWith('image/') && (
                <img
                  src={loadedFileDataUrl}
                  alt={selected.fileName || 'Study slide attachment'}
                  referrerPolicy="no-referrer"
                  className="mt-4 max-h-96 rounded-lg border border-slate-200 object-contain dark:border-slate-800"
                />
              )}

              {loadedFileDataUrl && isPdfDoc && (
                <div className={isSyntheticUploadPlaceholder ? '' : 'mt-4'}>
                  <PdfAnnotator
                    dataUrl={loadedFileDataUrl}
                    materialId={selected.id}
                    fileName={selected.fileName}
                  />
                </div>
              )}
            </div>

            <div className="mt-4">
              <LecturerAcknowledgement variant="compact" />
            </div>
          </div>
        )}
      </ModalShell>
        );
      })()}

      <ShareToPeerModal
        resource={
          shareTarget
            ? {
                type: 'material',
                id: shareTarget.id,
                title: shareTarget.title,
                courseCode: shareTarget.courseCode,
              }
            : null
        }
        onClose={() => setShareTarget(null)}
      />
    </div>
  );
}
