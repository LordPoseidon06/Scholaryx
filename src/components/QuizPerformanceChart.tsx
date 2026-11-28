import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ArrowDownRight, ArrowUpRight, ChartSpline, Minus } from 'lucide-react';
import { formatTimestamp, getTimestampMillis } from '../lib/utils';
import type { QuizAttempt } from '../types';

interface QuizPerformanceChartProps {
  quizAttempts: QuizAttempt[];
  onReviewQuiz?: (attempt: QuizAttempt) => void;
}

interface ChartPoint {
  attempt: QuizAttempt;
  subject: string;
  date: Date;
  score: number;
  indexInSubject: number;
  deltaFromPrev: number | null;
}

interface SubjectSeries {
  subject: string;
  color: string;
  points: ChartPoint[];
  average: number;
  latest: number;
  improvement: number | null;
}

const SUBJECT_PALETTE = [
  '#4f46e5', // Indigo
  '#0ea5e9', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#14b8a6', // Teal
  '#f97316', // Orange
];

export function QuizPerformanceChart({ quizAttempts, onReviewQuiz }: QuizPerformanceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [hoveredPoint, setHoveredPoint] = useState<{
    point: ChartPoint;
    color: string;
    xPx: number;
    yPx: number;
  } | null>(null);

  // Build chronological series grouped by course subject
  const { allPoints, seriesList, subjects } = useMemo(() => {
    const graded = quizAttempts
      .filter((q) => q.isGraded !== false && typeof q.score === 'number')
      .map((q) => {
        const ms = getTimestampMillis(q.createdAt) || getTimestampMillis(q.updatedAt) || Date.now();
        return {
          attempt: q,
          subject: (q.courseCode || 'GENERAL').trim().toUpperCase() || 'GENERAL',
          ms,
        };
      })
      .sort((a, b) => a.ms - b.ms);

    const bySubject = new Map<string, Array<{ attempt: QuizAttempt; subject: string; ms: number }>>();
    for (const item of graded) {
      const arr = bySubject.get(item.subject) || [];
      arr.push(item);
      bySubject.set(item.subject, arr);
    }

    const subjectNames = Array.from(bySubject.keys());
    const builtSeries: SubjectSeries[] = [];
    const flatPoints: ChartPoint[] = [];

    subjectNames.forEach((subject, sIdx) => {
      const rawItems = bySubject.get(subject) || [];
      const color = SUBJECT_PALETTE[sIdx % SUBJECT_PALETTE.length];
      const pts: ChartPoint[] = rawItems.map((item, idx) => {
        const prev = idx > 0 ? rawItems[idx - 1] : null;
        // Nudge duplicate millisecond timestamps slightly so D3 time scale separates same-second entries
        const uniqueMs = idx > 0 && item.ms <= rawItems[idx - 1].ms ? rawItems[idx - 1].ms + 1000 : item.ms;
        const pt: ChartPoint = {
          attempt: item.attempt,
          subject,
          date: new Date(uniqueMs),
          score: Math.max(0, Math.min(100, item.attempt.score)),
          indexInSubject: idx,
          deltaFromPrev: prev ? item.attempt.score - prev.attempt.score : null,
        };
        flatPoints.push(pt);
        return pt;
      });

      const avg = Math.round(pts.reduce((sum, p) => sum + p.score, 0) / Math.max(1, pts.length));
      const latest = pts[pts.length - 1]?.score ?? 0;
      const improvement = pts.length >= 2 ? latest - pts[0].score : null;

      builtSeries.push({
        subject,
        color,
        points: pts,
        average: avg,
        latest,
        improvement,
      });
    });

    return {
      allPoints: flatPoints.sort((a, b) => a.date.getTime() - b.date.getTime()),
      seriesList: builtSeries,
      subjects: subjectNames,
    };
  }, [quizAttempts]);

  // Reset subject filter if deleted
  useEffect(() => {
    if (selectedSubject !== 'ALL' && !subjects.includes(selectedSubject)) {
      setSelectedSubject('ALL');
    }
  }, [selectedSubject, subjects]);

  // Track responsive container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = Math.max(320, Math.floor(el.clientWidth));
      setContainerWidth(next);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleSeries = useMemo(() => {
    if (selectedSubject === 'ALL') return seriesList;
    return seriesList.filter((s) => s.subject === selectedSubject);
  }, [seriesList, selectedSubject]);

  const visiblePoints = useMemo(() => {
    return visibleSeries.flatMap((s) => s.points.map((pt) => ({ point: pt, color: s.color })));
  }, [visibleSeries]);

  // Overall trend summary across visible points
  const overallSummary = useMemo(() => {
    const pts = visibleSeries.flatMap((s) => s.points).sort((a, b) => a.date.getTime() - b.date.getTime());
    if (pts.length === 0) return null;
    const avg = Math.round(pts.reduce((sum, p) => sum + p.score, 0) / pts.length);
    const latest = pts[pts.length - 1].score;
    const delta = pts.length >= 2 ? latest - pts[0].score : null;
    return { count: pts.length, avg, latest, delta };
  }, [visibleSeries]);

  // Render D3 chart into SVG
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || visiblePoints.length === 0) return;

    const chartHeight = 290;
    const margin = { top: 20, right: 24, bottom: 38, left: 46 };
    const width = Math.max(320, containerWidth);
    const innerWidth = Math.max(120, width - margin.left - margin.right);
    const innerHeight = chartHeight - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${chartHeight}`).attr('width', width).attr('height', chartHeight);

    const defs = svg.append('defs');
    const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const dates = visiblePoints.map((d) => d.point.date);
    const minDate = d3.min(dates) || new Date();
    const maxDate = d3.max(dates) || new Date();
    const spanMs = maxDate.getTime() - minDate.getTime();
    const padMs = spanMs > 0 ? Math.max(spanMs * 0.06, 60_000) : 1000 * 60 * 60 * 12;

    const xScale = d3
      .scaleTime()
      .domain([new Date(minDate.getTime() - padMs), new Date(maxDate.getTime() + padMs)])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

    // Horizontal gridlines
    const yTicks = [0, 25, 50, 75, 100];
    root
      .append('g')
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', 'currentColor')
      .attr('class', (d) =>
        d === 0
          ? 'text-slate-300 dark:text-slate-700'
          : 'text-slate-200/80 dark:text-slate-800'
      )
      .attr('stroke-dasharray', (d) => (d === 0 ? 'none' : '4,4'))
      .attr('stroke-width', 1);

    // Y-axis labels
    const yAxis = d3
      .axisLeft(yScale)
      .tickValues(yTicks)
      .tickSize(0)
      .tickPadding(10)
      .tickFormat((d) => `${d}%`);

    const yAxisGroup = root.append('g').call(yAxis);
    yAxisGroup.select('.domain').remove();
    yAxisGroup
      .selectAll('text')
      .attr('class', 'fill-slate-500 dark:fill-slate-400 font-mono text-[11px] tabular-nums');

    // X-axis ticks
    const tickCount = width < 520 ? 4 : 6;
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(tickCount)
      .tickSize(4)
      .tickPadding(8)
      .tickFormat((d) => {
        const dt = d instanceof Date ? d : new Date(Number(d));
        return d3.timeFormat(spanMs < 1000 * 60 * 60 * 24 * 2 ? '%b %d, %H:%M' : '%b %d')(dt);
      });

    const xAxisGroup = root
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);
    xAxisGroup.select('.domain').attr('class', 'stroke-slate-300 dark:stroke-slate-700');
    xAxisGroup.selectAll('.tick line').attr('class', 'stroke-slate-300 dark:stroke-slate-700');
    xAxisGroup
      .selectAll('text')
      .attr('class', 'fill-slate-500 dark:fill-slate-400 font-mono text-[11px]');

    // Crosshair line (updated on hover)
    const crosshair = root
      .append('line')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', 'currentColor')
      .attr('class', 'text-indigo-400/70 dark:text-indigo-400/60')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .style('opacity', 0);

    const lineGenerator = d3
      .line<ChartPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.score))
      .curve(d3.curveMonotoneX);

    const areaGenerator = d3
      .area<ChartPoint>()
      .x((d) => xScale(d.date))
      .y0(innerHeight)
      .y1((d) => yScale(d.score))
      .curve(d3.curveMonotoneX);

    // Draw each subject line + optional area gradient
    visibleSeries.forEach((series, idx) => {
      const safeId = `quiz-grad-${idx}-${series.subject.replace(/[^a-zA-Z0-9]/g, '')}`;
      const gradient = defs
        .append('linearGradient')
        .attr('id', safeId)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      gradient.append('stop').attr('offset', '0%').attr('stop-color', series.color).attr('stop-opacity', 0.24);
      gradient.append('stop').attr('offset', '100%').attr('stop-color', series.color).attr('stop-opacity', 0.01);

      if (series.points.length >= 2) {
        if (visibleSeries.length === 1) {
          root
            .append('path')
            .datum(series.points)
            .attr('fill', `url(#${safeId})`)
            .attr('d', areaGenerator);
        }

        const path = root
          .append('path')
          .datum(series.points)
          .attr('fill', 'none')
          .attr('stroke', series.color)
          .attr('stroke-width', 2.75)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('d', lineGenerator);

        const totalLength = (path.node() as SVGPathElement | null)?.getTotalLength?.() || 0;
        if (totalLength > 0) {
          path
            .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
            .attr('stroke-dashoffset', totalLength)
            .transition()
            .duration(620)
            .ease(d3.easeCubicOut)
            .attr('stroke-dashoffset', 0);
        }
      } else if (series.points.length === 1) {
        // Single-quiz dashed reference guide for clarity
        root
          .append('line')
          .attr('x1', 0)
          .attr('x2', innerWidth)
          .attr('y1', yScale(series.points[0].score))
          .attr('y2', yScale(series.points[0].score))
          .attr('stroke', series.color)
          .attr('stroke-opacity', 0.35)
          .attr('stroke-dasharray', '5,5')
          .attr('stroke-width', 1.5);
      }

      // Data point circles
      root
        .selectAll(`.pt-${idx}`)
        .data(series.points)
        .join('circle')
        .attr('class', `pt-${idx}`)
        .attr('cx', (d) => xScale(d.date))
        .attr('cy', (d) => yScale(d.score))
        .attr('r', 4.75)
        .attr('fill', series.color)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .style('cursor', onReviewQuiz ? 'pointer' : 'default');
    });

    // Active highlight halo
    const activeHalo = root
      .append('circle')
      .attr('r', 8.5)
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .style('opacity', 0)
      .style('pointer-events', 'none');

    // Interactive pointer overlay for smooth nearest-point snapping
    const overlay = root
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', onReviewQuiz ? 'pointer' : 'crosshair');

    const findNearest = (mx: number, my: number) => {
      let best: { point: ChartPoint; color: string; px: number; py: number; dist: number } | null = null;
      for (const item of visiblePoints) {
        const px = xScale(item.point.date);
        const py = yScale(item.point.score);
        const dx = px - mx;
        const dy = py - my;
        // Favor horizontal proximity slightly when multiple subjects share similar timestamps
        const dist = dx * dx + dy * dy * 0.45;
        if (!best || dist < best.dist) {
          best = { point: item.point, color: item.color, px, py, dist };
        }
      }
      return best;
    };

    const inspectPointer = (event: MouseEvent | TouchEvent) => {
      const [mx, my] = d3.pointer(event);
      const nearest = findNearest(mx, my);
      if (!nearest) return;
      crosshair.attr('x1', nearest.px).attr('x2', nearest.px).style('opacity', 1);
      activeHalo
        .attr('cx', nearest.px)
        .attr('cy', nearest.py)
        .attr('stroke', nearest.color)
        .style('opacity', 0.9);
      setHoveredPoint({
        point: nearest.point,
        color: nearest.color,
        xPx: margin.left + nearest.px,
        yPx: margin.top + nearest.py,
      });
    };

    overlay
      .on('mousemove', (event: MouseEvent) => inspectPointer(event))
      .on('touchstart', (event: TouchEvent) => inspectPointer(event), { passive: true })
      .on('touchmove', (event: TouchEvent) => inspectPointer(event), { passive: true })
      .on('mouseleave', () => {
        crosshair.style('opacity', 0);
        activeHalo.style('opacity', 0);
        setHoveredPoint(null);
      })
      .on('click', (event: MouseEvent) => {
        if (!onReviewQuiz) return;
        const [mx, my] = d3.pointer(event);
        const nearest = findNearest(mx, my);
        if (nearest) {
          onReviewQuiz(nearest.point.attempt);
        }
      });
  }, [containerWidth, visibleSeries, visiblePoints, onReviewQuiz]);

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-2xs">
            <ChartSpline className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Quiz Accuracy Trends by Subject
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Interactive D3.js timeline tracking graded quiz accuracy improvements across your courses.
            </p>
          </div>
        </div>

        {overallSummary && (
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Avg: </span>
              <span className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {overallSummary.avg}%
              </span>
            </div>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Latest: </span>
              <span className="font-mono font-bold text-indigo-600 tabular-nums dark:text-indigo-400">
                {overallSummary.latest}%
              </span>
            </div>
            {overallSummary.delta !== null && (
              <>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <span
                  className={`inline-flex items-center gap-0.5 font-mono font-semibold tabular-nums ${
                    overallSummary.delta > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : overallSummary.delta < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {overallSummary.delta > 0 ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : overallSummary.delta < 0 ? (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                  {overallSummary.delta > 0 ? `+${overallSummary.delta}%` : `${overallSummary.delta}%`} net
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {allPoints.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <ChartSpline className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
            No graded quiz data to plot yet
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Complete and submit practice quizzes in the AI Study Studio to visualize accuracy trends across your courses.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Course Subject Filter & Interactive Legend */}
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <button
              type="button"
              onClick={() => setSelectedSubject('ALL')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                selectedSubject === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              All Subjects ({allPoints.length})
            </button>

            {seriesList.map((series) => {
              const active = selectedSubject === series.subject;
              return (
                <button
                  key={series.subject}
                  type="button"
                  onClick={() => setSelectedSubject((prev) => (prev === series.subject ? 'ALL' : series.subject))}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: series.color }}
                    aria-hidden="true"
                  />
                  <span>{series.subject}</span>
                  <span className="opacity-70 tabular-nums">({series.points.length})</span>
                </button>
              );
            })}
          </div>

          {/* D3 Responsive SVG Canvas + Hover Tooltip */}
          <div ref={containerRef} className="relative w-full">
            <svg ref={svgRef} className="block w-full overflow-visible" role="img" aria-label="Quiz accuracy trends over time chart" />

            {hoveredPoint && (
              <div
                className="pointer-events-none absolute z-20 w-56 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95"
                style={{
                  left: Math.min(Math.max(8, hoveredPoint.xPx - 112), Math.max(8, containerWidth - 232)),
                  top: hoveredPoint.yPx < 115 ? hoveredPoint.yPx + 14 : hoveredPoint.yPx - 104,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: hoveredPoint.color }}
                      aria-hidden="true"
                    />
                    {hoveredPoint.point.subject}
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums" style={{ color: hoveredPoint.color }}>
                    {hoveredPoint.point.score}%
                  </span>
                </div>
                <p className="mt-1 truncate font-medium text-slate-800 dark:text-slate-200">
                  {hoveredPoint.point.attempt.title}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="tabular-nums">
                    {hoveredPoint.point.attempt.totalQuestions} questions
                  </span>
                  {hoveredPoint.point.deltaFromPrev !== null && (
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        hoveredPoint.point.deltaFromPrev > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : hoveredPoint.point.deltaFromPrev < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {hoveredPoint.point.deltaFromPrev > 0
                        ? `+${hoveredPoint.point.deltaFromPrev}%`
                        : `${hoveredPoint.point.deltaFromPrev}%`}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  {formatTimestamp(hoveredPoint.point.attempt.createdAt)}
                </p>
              </div>
            )}
          </div>

          {/* Per-Subject Accuracy Breakdown Strip */}
          <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
            {seriesList.map((series) => (
              <div
                key={series.subject}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: series.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                      {series.subject}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                    {series.points.length} {series.points.length === 1 ? 'quiz' : 'quizzes'} · Avg {series.average}%
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {series.latest}%
                  </p>
                  {series.improvement !== null ? (
                    <p
                      className={`font-mono text-[11px] font-semibold tabular-nums ${
                        series.improvement > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : series.improvement < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {series.improvement > 0 ? `+${series.improvement}%` : `${series.improvement}%`}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400">Baseline</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
