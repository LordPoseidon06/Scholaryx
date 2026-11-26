import React from 'react';

function normalizeMathFragment(expr: string): string {
  return expr
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\mathbf\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\left([(\[{|])/g, '$1')
    .replace(/\\right([)\]}|])/g, '$1')
    .replace(/\\left\\lfloor/g, '⌊')
    .replace(/\\right\\rfloor/g, '⌋')
    .replace(/\\lfloor/g, '⌊')
    .replace(/\\rfloor/g, '⌋')
    .replace(/\\lceil/g, '⌈')
    .replace(/\\rceil/g, '⌉')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\implies/g, '⇒')
    .replace(/\\rightarrow|\\to/g, '→')
    .replace(/\\leftarrow/g, '←')
    .replace(/\\infty/g, '∞')
    .replace(/\\sum/g, '∑')
    .replace(/\\prod/g, '∏')
    .replace(/\\int/g, '∫')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\delta/g, 'δ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\mu/g, 'μ')
    .replace(/\\pi/g, 'π')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\Omega/g, 'Ω')
    .replace(/\\Theta/g, 'Θ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanReadableMath(text: string): string {
  let out = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner: string) => normalizeMathFragment(inner));
  out = out.replace(/\$([^$\n]+)\$/g, (full, inner: string) => {
    if (/[\\^_=+\-*/<>()]/.test(inner) || /^[a-zA-Z]$/.test(inner.trim())) {
      return normalizeMathFragment(inner);
    }
    return full;
  });
  return out;
}

function renderInline(rawText: string): React.ReactNode[] {
  const text = cleanReadableMath(rawText);
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800 dark:bg-slate-800 dark:text-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**')) {
      return (
        <em key={idx} className="italic text-slate-800 dark:text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

interface ListEntry {
  text: string;
  indented: boolean;
}

export function MarkdownView({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let listItems: ListEntry[] = [];
  let listOrdered = false;
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let tableRows: string[][] = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return;
    const ListTag = listOrdered ? 'ol' : 'ul';
    const listStyle = listOrdered ? 'list-decimal' : 'list-disc';
    elements.push(
      <ListTag
        key={`${keyPrefix}-list`}
        className={`my-2.5 space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 ${listStyle} dark:text-slate-300`}
      >
        {listItems.map((item, i) => (
          <li key={i} className={item.indented ? 'ml-4' : ''}>
            {renderInline(item.text)}
          </li>
        ))}
      </ListTag>
    );
    listItems = [];
  };

  const flushTable = (keyPrefix: string) => {
    if (tableRows.length === 0) return;
    const [header, ...rest] = tableRows;
    const isSeparatorRow = (row: string[]) => row.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
    const bodyRows = rest.filter((r) => !isSeparatorRow(r));
    elements.push(
      <div key={`${keyPrefix}-tbl`} className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              {header.map((cell, i) => (
                <th key={i} className="border-b border-slate-200 px-3 py-2 font-semibold dark:border-slate-700">
                  {renderInline(cell.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700 dark:divide-slate-800 dark:text-slate-300">
            {bodyRows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-3 py-2">
                    {renderInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushList(`line-${idx}`);
      flushTable(`line-${idx}`);
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLines = [];
      } else {
        inCodeBlock = false;
        elements.push(
          <pre
            key={`code-${idx}`}
            className="my-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-3.5 font-mono text-xs leading-relaxed text-slate-100 dark:border-slate-700"
          >
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      return;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushList(`line-${idx}`);
      const cells = trimmed.slice(1, -1).split('|');
      tableRows.push(cells);
      return;
    }

    flushTable(`line-${idx}`);

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushList(`line-${idx}`);
      elements.push(<hr key={idx} className="my-4 border-slate-200 dark:border-slate-800" />);
      return;
    }

    if (trimmed.startsWith('#### ')) {
      flushList(`line-${idx}`);
      elements.push(
        <h5 key={idx} className="mt-3.5 mb-1 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          {renderInline(trimmed.slice(5))}
        </h5>
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList(`line-${idx}`);
      elements.push(
        <h4 key={idx} className="mt-4 mb-1.5 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList(`line-${idx}`);
      elements.push(
        <h3 key={idx} className="mt-5 mb-2 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList(`line-${idx}`);
      elements.push(
        <h2 key={idx} className="mt-5 mb-2 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith('> ')) {
      flushList(`line-${idx}`);
      elements.push(
        <blockquote
          key={idx}
          className="my-2.5 rounded-lg border border-blue-200/80 bg-blue-50/40 px-3.5 py-2 text-sm text-slate-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-slate-300"
        >
          {renderInline(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    const bulletMatch = line.match(/^(\s*)[-*•]\s+(.+)$/);
    if (bulletMatch) {
      if (listItems.length > 0 && listOrdered) {
        flushList(`line-${idx}`);
      }
      listOrdered = false;
      listItems.push({
        indented: bulletMatch[1].length >= 2,
        text: bulletMatch[2],
      });
      return;
    }

    const numMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (numMatch) {
      if (listItems.length > 0 && !listOrdered) {
        flushList(`line-${idx}`);
      }
      listOrdered = true;
      listItems.push({
        indented: numMatch[1].length >= 2,
        text: numMatch[2],
      });
      return;
    }

    flushList(`line-${idx}`);
    if (trimmed === '') {
      return;
    }

    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      elements.push(
        <div
          key={idx}
          className="my-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
        >
          {normalizeMathFragment(trimmed.slice(2, -2))}
        </div>
      );
      return;
    }

    elements.push(
      <p key={idx} className="my-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {renderInline(line)}
      </p>
    );
  });

  flushList('end');
  flushTable('end');

  return <div className="space-y-1">{elements}</div>;
}
