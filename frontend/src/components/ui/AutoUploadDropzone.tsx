import { useRef, useState, type DragEvent } from 'react';
import { IconUpload } from '@tabler/icons-react';

// A drop area that hands files to `onFiles` the moment they're dropped or
// picked -- there is no "selected, now press Upload" step. The caller does the
// upload (and saves it) inside onFiles; while that runs this shows
// "Uploading…" and ignores further drops. Used where Brent asked for files to
// be saved the instant they land (visit photos, lease documents).
export function AutoUploadDropzone({
  accept,
  multiple = false,
  label,
  disabled,
  onFiles,
}: {
  accept?: string;
  multiple?: boolean;
  label: string;
  disabled?: boolean;
  onFiles: (files: File[]) => Promise<void> | void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inactive = disabled || busy;

  async function handle(list: FileList | null | undefined) {
    const files = Array.from(list ?? []);
    if (files.length === 0 || inactive) return;
    setBusy(true);
    try {
      await onFiles(multiple ? files : files.slice(0, 1));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handle(e.dataTransfer.files);
  }

  return (
    <div
      className={`file-drop${dragOver ? ' over' : ''}`}
      style={{ padding: 14, cursor: inactive ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
      onClick={() => !inactive && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!inactive) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <IconUpload size={16} style={{ marginBottom: 4 }} />
      <div>{busy ? 'Uploading…' : label}</div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        disabled={inactive}
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}
