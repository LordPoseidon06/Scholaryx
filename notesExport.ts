export interface NotesExportInput {
  title: string;
  courseCode?: string;
  subtitle?: string;
  markdownContent: string;
}

function sanitizeFilename(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return clean || 'scholaryx_notes';
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

function formatInlineHtml(rawText: string): string {
  const tokens = rawText.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return tokens
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**')) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }
      return escapeHtml(part);
    })
    .join('');
}

function markdownToSafeHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const htmlParts: string[] = [];
  let listItems: Array<{ text: string; indented: boolean }> = [];
  let listOrdered = false;
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let tableRows: string[][] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const tag = listOrdered ? 'ol' : 'ul';
    const itemsHtml = listItems
      .map(
        (item) =>
          `<li${item.indented ? ' class="indented"' : ''}>${formatInlineHtml(item.text)}</li>`
      )
      .join('');
    htmlParts.push(`<${tag}>${itemsHtml}</${tag}>`);
    listItems = [];
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [header, ...rest] = tableRows;
    const isSeparatorRow = (row: string[]) =>
      row.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
    const bodyRows = rest.filter((r) => !isSeparatorRow(r));
    const headHtml = header.map((cell) => `<th>${formatInlineHtml(cell.trim())}</th>`).join('');
    const bodyHtml = bodyRows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${formatInlineHtml(cell.trim())}</td>`).join('')}</tr>`
      )
      .join('');
    htmlParts.push(
      `<div class="table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
    );
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushList();
      flushTable();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLines = [];
      } else {
        inCodeBlock = false;
        htmlParts.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushList();
      tableRows.push(trimmed.slice(1, -1).split('|'));
      continue;
    }

    flushTable();

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushList();
      htmlParts.push('<hr />');
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      flushList();
      htmlParts.push(`<h4>${formatInlineHtml(trimmed.slice(5))}</h4>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      htmlParts.push(`<h3>${formatInlineHtml(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      htmlParts.push(`<h2>${formatInlineHtml(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      htmlParts.push(`<h1>${formatInlineHtml(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushList();
      htmlParts.push(`<blockquote>${formatInlineHtml(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[-*•]\s+(.+)$/);
    if (bulletMatch) {
      if (listItems.length > 0 && listOrdered) {
        flushList();
      }
      listOrdered = false;
      listItems.push({
        indented: bulletMatch[1].length >= 2,
        text: bulletMatch[2],
      });
      continue;
    }

    const numMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (numMatch) {
      if (listItems.length > 0 && !listOrdered) {
        flushList();
      }
      listOrdered = true;
      listItems.push({
        indented: numMatch[1].length >= 2,
        text: numMatch[2],
      });
      continue;
    }

    flushList();
    if (trimmed === '') continue;

    htmlParts.push(`<p>${formatInlineHtml(line)}</p>`);
  }

  if (inCodeBlock && codeLines.length > 0) {
    htmlParts.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  flushList();
  flushTable();

  return htmlParts.join('\n');
}

export function downloadNotesAsMarkdown(input: NotesExportInput) {
  const heading = input.title || 'Study Notes';
  const metaParts = [
    input.courseCode ? `Course: ${input.courseCode}` : '',
    input.subtitle || '',
  ].filter(Boolean);

  const parts: string[] = [`# ${heading}`];
  if (metaParts.length > 0) {
    parts.push(metaParts.join(' · '));
  }
  parts.push('', '---', '', input.markdownContent.trim(), '');

  const slug = sanitizeFilename([input.courseCode, input.title, 'notes'].filter(Boolean).join('_'));
  triggerDownload(parts.join('\n'), `${slug}.md`, 'text/markdown;charset=utf-8');
}

export function downloadNotesAsHtml(input: NotesExportInput) {
  const renderedBody = markdownToSafeHtml(input.markdownContent);
  const metaLine = [input.courseCode || 'Scholaryx Study Notes', input.subtitle || '']
    .filter(Boolean)
    .join(' · ');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title || 'Scholaryx Study Notes')}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      line-height: 1.6;
    }
    .container { max-width: 820px; margin: 0 auto; }
    .header {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .meta { font-size: 13px; color: #1d4ed8; font-weight: 700; margin-bottom: 6px; }
    .doc-title { margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .btn {
      cursor: pointer;
      border: 1px solid #1d4ed8;
      background: #1d4ed8;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
    }
    .sheet {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 28px;
    }
    .sheet h1 { font-size: 20px; margin: 22px 0 10px; color: #0f172a; }
    .sheet h2 { font-size: 18px; margin: 20px 0 8px; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
    .sheet h3 { font-size: 15.5px; margin: 16px 0 6px; color: #1e293b; }
    .sheet h4 { font-size: 14px; margin: 14px 0 4px; color: #334155; }
    .sheet p { margin: 8px 0; font-size: 14.5px; color: #334155; }
    .sheet ul, .sheet ol { margin: 8px 0 12px; padding-left: 22px; font-size: 14.5px; color: #334155; }
    .sheet li { margin: 5px 0; }
    .sheet li.indented { margin-left: 16px; }
    .sheet code {
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      color: #0f172a;
    }
    .sheet pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 14px 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 13px;
    }
    .sheet pre code { background: transparent; color: inherit; padding: 0; }
    .sheet blockquote {
      margin: 12px 0;
      padding: 8px 14px;
      border-left: 3px solid #1d4ed8;
      background: #eff6ff;
      color: #1e293b;
      border-radius: 0 6px 6px 0;
    }
    .sheet hr { border: 0; border-top: 1px solid #e2e8f0; margin: 18px 0; }
    .table-wrap { overflow-x: auto; margin: 14px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; color: #0f172a; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .toolbar { display: none; }
      .header, .sheet { border: none; padding: 12px 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="meta">${escapeHtml(metaLine)}</div>
      <h1 class="doc-title">${escapeHtml(input.title || 'Generated Study Notes')}</h1>
      <div class="toolbar">
        <button type="button" class="btn" onclick="window.print()">Print / Save PDF</button>
      </div>
    </header>
    <main class="sheet">
      ${renderedBody}
    </main>
  </div>
</body>
</html>`;

  const slug = sanitizeFilename([input.courseCode, input.title, 'notes'].filter(Boolean).join('_'));
  triggerDownload(html, `${slug}.html`, 'text/html;charset=utf-8');
}
