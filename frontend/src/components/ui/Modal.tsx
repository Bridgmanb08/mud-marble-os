import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  xl?: boolean;
}

export function Modal({ title, onClose, children, wide, xl }: ModalProps) {
  return (
    <div
      className="mo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`mb${xl ? ' xl' : wide ? ' wide' : ''}`}>
        <div className="mt">{title}</div>
        {children}
      </div>
    </div>
  );
}
