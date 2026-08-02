import { useRef, useState, type DragEvent } from 'react';
import { IconUpload } from '@tabler/icons-react';

interface FileDropzoneProps {
  accept?: string;
  file: File | null;
  onFileSelected: (file: File | null) => void;
  label?: string;
  disabled?: boolean;
}

export function FileDropzone({ accept, file, onFileSelected, label, disabled }: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFileSelected(dropped);
  }

  return (
    <div
      className={`file-drop${dragOver ? ' over' : ''}`}
      style={{ padding: 14, cursor: disabled ? 'default' : 'pointer' }}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <IconUpload size={16} style={{ marginBottom: 4 }} />
      <div>{file ? file.name : label || 'Drag and drop a file here, or click to browse'}</div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => onFileSelected(e.target.files?.[0] || null)}
      />
    </div>
  );
}
