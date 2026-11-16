import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
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
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function MarkdownView({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`${keyPrefix}-ul`} className="my-2.5 space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 list-disc dark:text-slate-300">
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      flushList(`line-${idx}`);
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

    if (line.startsWith('### ')) {
      flushList(`line-${idx}`);
      elements.push(
        <h4 key={idx} className="mt-4 mb-1.5 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          {renderInline(line.slice(4))}
        </h4>
      );
      return;
    }

    if (line.startsWith('## ')) {
      flushList(`line-${idx}`);
      elements.push(
        <h3 key={idx} className="mt-5 mb-2 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          {renderInline(line.slice(3))}
        </h3>
      );
      return;
    }

    if (line.startsWith('# ')) {
      flushList(`line-${idx}`);
      elements.push(
        <h2 key={idx} className="mt-5 mb-2 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          {renderInline(line.slice(2))}
        </h2>
      );
      return;
    }

    if (/^[-*•]\s+/.test(line.trim())) {
      listItems.push(line.trim().replace(/^[-*•]\s+/, ''));
      return;
    }

    if (/^\d+\.\s+/.test(line.trim())) {
      listItems.push(line.trim().replace(/^\d+\.\s+/, ''));
      return;
    }

    flushList(`line-${idx}`);
    if (line.trim() === '') {
      return;
    }

    elements.push(
      <p key={idx} className="my-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {renderInline(line)}
      </p>
    );
  });

  flushList('end');

  return <div className="space-y-1">{elements}</div>;
}
