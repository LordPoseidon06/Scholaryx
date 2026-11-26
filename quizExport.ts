import type { GeneratedQuizQuestion } from '../types';

export interface QuizExportInput {
  title: string;
  courseCode?: string;
  difficulty?: string;
  questions: GeneratedQuizQuestion[];
  answers?: Record<number, number> | number[];
  isGraded?: boolean;
  scorePercent?: number;
}

function getPickedIndex(
  answers: Record<number, number> | number[] | undefined,
  idx: number
): number | undefined {
  if (!answers) return undefined;
  const val = Array.isArray(answers) ? answers[idx] : answers[idx];
  return typeof val === 'number' && val >= 0 ? val : undefined;
}

function sanitizeFilename(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return clean || 'scholaryx_quiz';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadQuizAsMarkdown(input: QuizExportInput) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const lines: string[] = [];
  const heading = input.title || 'Practice Quiz';
  lines.push(`# ${heading}`);
  const metaParts = [
    input.courseCode ? `Course: ${input.courseCode}` : '',
    input.difficulty ? `Difficulty: ${input.difficulty}` : '',
    `Questions: ${input.questions.length}`,
    input.isGraded && typeof input.scorePercent === 'number'
      ? `Score: ${input.scorePercent}%`
      : '',
  ].filter(Boolean);
  if (metaParts.length > 0) {
    lines.push(metaParts.join(' · '));
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Questions');
  lines.push('');

  input.questions.forEach((q, idx) => {
    lines.push(`### ${idx + 1}. ${q.question}`);
    q.options.forEach((opt, optIdx) => {
      const letter = letters[optIdx] || String(optIdx + 1);
      lines.push(`- **${letter}.** ${opt}`);
    });
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('## Answer Key & Explanations');
  lines.push('');

  input.questions.forEach((q, idx) => {
    const correctLetter = letters[q.correctIndex] || String(q.correctIndex + 1);
    const correctText = q.options[q.correctIndex] || '';
    const pickedIdx = getPickedIndex(input.answers, idx);
    let pickedNote = '';
    if (typeof pickedIdx === 'number') {
      const pickedLetter = letters[pickedIdx] || String(pickedIdx + 1);
      const verdict = pickedIdx === q.correctIndex ? 'Correct' : 'Incorrect';
      pickedNote = ` | Your answer: **${pickedLetter}** (${verdict})`;
    }
    lines.push(
      `**${idx + 1}. Answer: ${correctLetter}** (${correctText})${pickedNote}`
    );
    if (q.explanation) {
      lines.push(`> ${q.explanation}`);
    }
    lines.push('');
  });

  const fileSlug = sanitizeFilename(
    [input.courseCode, input.title].filter(Boolean).join('_') || 'quiz'
  );
  triggerDownload(lines.join('\n'), `${fileSlug}.md`, 'text/markdown;charset=utf-8');
}

export function downloadQuizAsHtml(input: QuizExportInput) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const correctCount = input.questions.reduce((acc, q, idx) => {
    const picked = getPickedIndex(input.answers, idx);
    return acc + (picked === q.correctIndex ? 1 : 0);
  }, 0);
  const computedPct =
    typeof input.scorePercent === 'number'
      ? input.scorePercent
      : input.questions.length > 0
      ? Math.round((correctCount / input.questions.length) * 100)
      : 0;

  const questionCards = input.questions
    .map((q, idx) => {
      const picked = getPickedIndex(input.answers, idx);
      const optionsHtml = q.options
        .map((opt, optIdx) => {
          const letter = letters[optIdx] || String(optIdx + 1);
          const isCorrect = optIdx === q.correctIndex;
          const isPicked = picked === optIdx;
          const statusAttr = isCorrect ? 'data-correct="true"' : '';
          const pickedBadge = isPicked
            ? `<span class="badge picked">Your Pick</span>`
            : '';
          const correctBadge = isCorrect
            ? `<span class="badge answer-badge" style="display:none;">Correct</span>`
            : '';
          return `
            <li class="option ${isPicked ? 'is-picked' : ''}" ${statusAttr}>
              <span class="opt-letter">${letter}</span>
              <span class="opt-text">${escapeHtml(opt)}</span>
              ${pickedBadge}
              ${correctBadge}
            </li>`;
        })
        .join('');

      const correctLetter = letters[q.correctIndex] || String(q.correctIndex + 1);
      return `
        <article class="q-card">
          <div class="q-header">
            <span class="q-num">Q${String(idx + 1).padStart(2, '0')}</span>
            <h2 class="q-title">${escapeHtml(q.question)}</h2>
          </div>
          <ul class="options">${optionsHtml}</ul>
          <div class="answer-panel" ${input.isGraded ? '' : 'style="display:none;"'}>
            <p><strong>Correct Answer:</strong> ${correctLetter}. ${escapeHtml(
        q.options[q.correctIndex] || ''
      )}</p>
            ${
              q.explanation
                ? `<p class="explanation">${escapeHtml(q.explanation)}</p>`
                : ''
            }
          </div>
        </article>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title || 'Scholaryx Practice Quiz')}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      line-height: 1.5;
    }
    .container { max-width: 820px; margin: 0 auto; }
    .header {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .meta { font-size: 13px; color: #475569; margin-bottom: 8px; font-weight: 600; }
    .title { margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; }
    .score-pill {
      display: inline-block;
      margin-top: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 13px;
      font-weight: 600;
    }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .btn {
      cursor: pointer;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #0f172a;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
    }
    .btn-primary {
      background: #1d4ed8;
      border-color: #1d4ed8;
      color: #ffffff;
    }
    .q-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 14px;
      break-inside: avoid;
    }
    .q-header { display: flex; gap: 10px; align-items: baseline; margin-bottom: 12px; }
    .q-num { font-family: monospace; font-size: 13px; font-weight: 700; color: #1d4ed8; }
    .q-title { margin: 0; font-size: 15px; font-weight: 600; }
    .options { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 13.5px;
      background: #f8fafc;
    }
    .option.is-picked { border-color: #2563eb; background: #eff6ff; }
    body.show-keys .option[data-correct="true"] { border-color: #16a34a; background: #f0fdf4; }
    body.show-keys .option.is-picked:not([data-correct="true"]) { border-color: #dc2626; background: #fef2f2; }
    .opt-letter { font-family: monospace; font-weight: 700; color: #475569; min-width: 18px; }
    .opt-text { flex: 1; }
    .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px;
    }
    .badge.picked { background: #dbeafe; color: #1e40af; }
    .badge.answer-badge { background: #dcfce7; color: #166534; }
    .answer-panel {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 8px;
      background: #f1f5f9;
      font-size: 13px;
    }
    .answer-panel p { margin: 0; }
    .answer-panel .explanation { margin-top: 6px; color: #334155; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .toolbar { display: none; }
    }
  </style>
</head>
<body class="${input.isGraded ? 'show-keys' : ''}">
  <div class="container">
    <header class="header">
      <div class="meta">${escapeHtml(
        [
          input.courseCode || 'Scholaryx Quiz',
          input.difficulty || '',
          `${input.questions.length} Questions`,
        ]
          .filter(Boolean)
          .join(' · ')
      )}</div>
      <h1 class="title">${escapeHtml(input.title || 'Practice Quiz')}</h1>
      ${
        input.isGraded
          ? `<div class="score-pill">Graded Score: ${correctCount} / ${input.questions.length} (${computedPct}%)</div>`
          : ''
      }
      <div class="toolbar">
        <button type="button" class="btn btn-primary" onclick="toggleAnswers()">
          ${input.isGraded ? 'Hide Answer Key &amp; Explanations' : 'Show Answer Key &amp; Explanations'}
        </button>
        <button type="button" class="btn" onclick="window.print()">Print / Save PDF</button>
      </div>
    </header>
    <main>${questionCards}</main>
  </div>
  <script>
    var shown = ${input.isGraded ? 'true' : 'false'};
    function syncKeys() {
      document.body.classList.toggle('show-keys', shown);
      document.querySelectorAll('.answer-panel').forEach(function(el) {
        el.style.display = shown ? 'block' : 'none';
      });
      document.querySelectorAll('.answer-badge').forEach(function(el) {
        el.style.display = shown ? 'inline-block' : 'none';
      });
    }
    function toggleAnswers() {
      shown = !shown;
      var btn = document.querySelector('.btn-primary');
      if (btn) btn.textContent = shown ? 'Hide Answer Key & Explanations' : 'Show Answer Key & Explanations';
      syncKeys();
    }
    syncKeys();
  </script>
</body>
</html>`;

  const fileSlug = sanitizeFilename(
    [input.courseCode, input.title].filter(Boolean).join('_') || 'quiz'
  );
  triggerDownload(html, `${fileSlug}.html`, 'text/html;charset=utf-8');
}
