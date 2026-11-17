import type { ReactNode } from 'react';

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

/** Renders a note with every http(s) URL, including Google Photos, as a link. */
export function LinkText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  const urls = text.match(URL_RE) || [];
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) out.push(<span key={`t${i}`}>{part}</span>);
    const url = urls[i];
    if (url) {
      const href = url.replace(/[.,);]+$/, '');
      out.push(
        <a key={`u${i}`} href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>
          {url}
        </a>
      );
    }
  });
  return <>{out}</>;
}
