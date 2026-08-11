import { useEffect, useState } from 'react';

// The one place JS-level responsive branching goes through in this app --
// everywhere else responsiveness is plain CSS media queries, but a few
// things (the sidebar drawer's default state, whether a tap on a Kanban
// card opens a status menu instead of starting a drag) need to know the
// viewport size in JS, not just CSS. SSR-safe guard matches the existing
// `typeof window !== 'undefined'` idiom already used in RentalVisuals.tsx.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

// Matches the one breakpoint this app's CSS already uses
// (@media(max-width:768px) in index.css) so JS and CSS branching never
// disagree about what "mobile" means.
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}
