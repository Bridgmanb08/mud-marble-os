// Hands files picked in one place (the new-project steps) to the site walk
// window on the estimate page that opens next. A plain in-memory variable is
// enough: it only needs to survive the in-app navigation, and File objects
// can't travel through a URL.
let pending: File[] | null = null;

export function setPendingSiteWalk(files: File[]): void {
  pending = files;
}

// Returns the files once, then forgets them.
export function takePendingSiteWalk(): File[] | null {
  const files = pending;
  pending = null;
  return files;
}
