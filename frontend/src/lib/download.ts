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

// "<address>-<export date>-<Estimate|Invoice|CO>.pdf". Real address always
// leads, per Brent's explicit correction -- a project's name is often just
// the address too (see every "224 N Summit"-style name), but some real
// jobs are named after the client instead ("Will and Grace Block" has a
// real address of "4506 N Pennsylvania" that shares nothing with its
// name), so this must use the project's actual address field, not a
// name-cleanup heuristic. Falls back to the (client-suffix-stripped)
// project name only when a project genuinely has no address on file.
// Date is filesystem-safe ISO (YYYY-MM-DD), not the app's usual "Sep 12,
// 2026" display format.
export function pdfExportFilename(
  address: string | null | undefined,
  projectName: string | null | undefined,
  kind: 'Estimate' | 'Invoice' | 'CO'
): string {
  const raw = (address && address.trim()) || (projectName || 'Job').split('|')[0].trim();
  const safeAddress = raw.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return `${safeAddress}-${date}-${kind}.pdf`;
}
