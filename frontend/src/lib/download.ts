// Forces a real download of a same-origin URL (e.g. a PDF export endpoint)
// instead of the browser opening/previewing it, and lets us choose the
// exact saved filename client-side rather than relying on the server's
// Content-Disposition filename -- an <a download> click never navigates
// the page away and its `download` attribute overrides whatever filename
// the response header suggested, in every major browser.
export function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// "<job>-<export date>-<Estimate|Invoice|CO>.pdf" -- the job's project name
// already reads as its address in this app's own convention (see every
// "224 N Summit"/"5756 Norwaldo Ave"-style name), so a "| Client Name"
// suffix (the same one stripped everywhere else project names are shown,
// e.g. ProjectPicker) is the only cleanup needed. Date is filesystem-safe
// ISO (YYYY-MM-DD), not the app's usual "Sep 12, 2026" display format.
export function pdfExportFilename(projectName: string | null | undefined, kind: 'Estimate' | 'Invoice' | 'CO'): string {
  const address = (projectName || 'Job').split('|')[0].trim();
  const safeAddress = address.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return `${safeAddress}-${date}-${kind}.pdf`;
}
