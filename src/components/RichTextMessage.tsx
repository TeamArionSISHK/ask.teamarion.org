import { Fragment, ReactNode } from 'react';

interface RichTextMessageProps {
  text: string;
}

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const token = match[0];

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`inline-${matchIndex++}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={`inline-${matchIndex++}`} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`inline-${matchIndex++}`}
          className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-100"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function RichTextMessage({ text }: RichTextMessageProps) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushParagraph() {
    if (!paragraphLines.length) {
      return;
    }

    blocks.push(
      <p key={`p-${key++}`} className="mt-0 whitespace-pre-wrap text-[1rem] leading-[1.68] text-slate-100">
        {renderInline(paragraphLines.join(' '))}
      </p>,
    );
    paragraphLines = [];
  }

  function flushList() {
    if (!listItems.length) {
      return;
    }

    blocks.push(
      <ul key={`ul-${key++}`} className="mt-0 list-disc space-y-2 pl-5 text-[1rem] leading-[1.68] text-slate-100">
        {listItems.map((item, index) => (
          <li key={`li-${key}-${index}`}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr-${key++}`} className="border-0 border-t border-white/10" />);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const headingClass =
        level === 1
          ? 'text-[1.2rem] font-semibold tracking-[-0.02em] text-white'
          : level === 2
            ? 'text-[1.08rem] font-semibold tracking-[-0.015em] text-white'
            : 'text-[0.96rem] font-semibold uppercase tracking-[0.08em] text-slate-200';

      blocks.push(
        <div key={`h-${key++}`} className={headingClass}>
          {renderInline(content)}
        </div>,
      );
      continue;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();

  return <Fragment>{blocks}</Fragment>;
}
