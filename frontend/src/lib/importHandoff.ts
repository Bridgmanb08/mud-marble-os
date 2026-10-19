// Hands spreadsheets / scans chosen in the new-project steps to the Job import
// screen that opens next, along with what each file was detected to be. An
// in-memory variable is enough: it only has to survive the in-app navigation,
// and File objects can't travel through a URL.
export interface FileDetection {
  kind: 'workbook' | 'scan' | 'unsupported';
  has_estimate: boolean;
  has_inhouse: boolean;
  sheets: string[];
  label: string;
}

export interface PendingImportFile {
  file: File;
  detection: FileDetection;
}

let pending: PendingImportFile[] | null = null;

export function setPendingImport(files: PendingImportFile[]): void {
  pending = files;
}

// Returns the files once, then forgets them.
export function takePendingImport(): PendingImportFile[] | null {
  const files = pending;
  pending = null;
  return files;
}
