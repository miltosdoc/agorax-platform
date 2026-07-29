/**
 * Plain text with clickable links — safe by construction.
 *
 * The text is user-authored (any community member can write a conference
 * agenda), so it is NEVER handed to dangerouslySetInnerHTML. We split it
 * with a URL regex and emit React elements: anything that isn't a matched
 * link stays a text node, which React escapes. A `javascript:` payload
 * therefore renders as literal characters instead of executing.
 *
 * Deliberately not a markdown renderer. Bare URLs and www. hosts become
 * anchors; everything else — including newlines, which the caller keeps
 * with `whitespace-pre-wrap` — is left alone.
 */
import React from 'react';

// Matches http(s):// URLs and bare www. hosts. Trailing sentence punctuation
// is excluded from the match so "see https://x.gr/a." doesn't swallow the dot.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}«»"']+[^\s<>()[\]{}«»"'.,;:!?]/gi;

interface LinkedTextProps {
  text: string;
  className?: string;
}

export function LinkedText({ text, className = '' }: LinkedTextProps) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  // Fresh lastIndex per render — the regex is module-level and /g is stateful.
  URL_RE.lastIndex = 0;

  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const raw = match[0];
    // Bare www. hosts need a scheme or the browser resolves them relative
    // to the current page. http is upgraded by the target host if it can.
    const href = raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw;
    parts.push(
      <a
        key={`${match.index}-${raw}`}
        href={href}
        target="_blank"
        // noopener: the opened page must not reach back through window.opener.
        rel="noopener noreferrer nofollow"
        className="text-primary underline underline-offset-2 hover:no-underline break-words"
        onClick={(e) => e.stopPropagation()}
      >
        {raw}
      </a>,
    );
    cursor = match.index + raw.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <span className={`whitespace-pre-wrap break-words ${className}`}>{parts}</span>;
}
