import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Client-side route changes don't reset scroll position on their own --
// without this, navigating from a scrolled-down page (the Projects list,
// a project you'd scrolled partway through) to a brand new page keeps the
// old pixel offset, landing you wherever that happens to fall on the new
// page's layout (reported: consistently landing near the Schedule section
// of a freshly opened project, since that's roughly where the old scroll
// position lined up). Scrolls back to the top on every path change so a
// newly opened page always starts at its own top.
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
