import { useEffect, useState } from 'react';
import { IconCheck, IconCopy, IconMail } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { SubEmailDraft, Subcontractor } from '../../types';

interface SubEmailDraftModalProps {
  sub: Subcontractor;
  onClose: () => void;
}

export function SubEmailDraftModal({ sub, onClose }: SubEmailDraftModalProps) {
  const [draft, setDraft] = useState<SubEmailDraft | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .post<SubEmailDraft>(`/subcontractors/${sub.id}/draft-email`)
      .then(setDraft)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to draft email'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.id]);

  function copyToClipboard() {
    if (!draft) return;
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const mailtoHref = draft
    ? `mailto:${draft.to_email || ''}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : undefined;

  return (
    <Modal title={`Draft email to ${sub.company_name}`} onClose={onClose} wide>
      {error && <div className="merr">{error}</div>}
      {!draft && !error && <div style={{ fontSize: 13, color: 'var(--t2)', padding: '20px 0' }}>Drafting…</div>}
      {draft && (
        <>
          {!draft.to_email && (
            <div className="merr" style={{ marginBottom: 10 }}>
              No email on file for this sub -- add one to use "Open in email client" directly.
            </div>
          )}
          <div className="fg">
            <label className="fl">Subject</label>
            <input className="fi" readOnly value={draft.subject} />
          </div>
          <div className="fg">
            <label className="fl">Body</label>
            <textarea className="fi" readOnly value={draft.body} style={{ minHeight: 180 }} />
          </div>
          <div className="ma">
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn" onClick={copyToClipboard}>
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <a
              className="btn btn-p"
              href={mailtoHref}
              style={{ pointerEvents: draft.to_email ? undefined : 'none', opacity: draft.to_email ? 1 : 0.5 }}
            >
              <IconMail size={14} /> Open in email client
            </a>
          </div>
        </>
      )}
    </Modal>
  );
}
