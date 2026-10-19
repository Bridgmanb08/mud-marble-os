import { Link } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { EstimateImportSection } from '../job-import/EstimateImportSection';
import type { FileDetection } from '../../lib/importHandoff';

// Brings an Excel estimate (or a scan of one) into the estimate that's open: pick
// or drop the file, check the rows, import. A workbook that also carries
// QuickBooks / contractor sheets points to the Job import screen for those.
export function ImportSheetModal({
  projectId,
  estimateId,
  initialFile,
  detection,
  onClose,
  onImported,
}: {
  projectId: string;
  estimateId: string;
  initialFile?: File | null;
  detection?: FileDetection | null;
  onClose: () => void;
  onImported: () => void;
}) {
  return (
    <Modal title="Import an estimate from Excel" xl onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 12 }}>
        Choose an Excel estimate (or a PDF / photo of one). Rows already on this estimate are matched so nothing is added twice, and you pick what to import.
      </p>
      {detection?.has_inhouse && (
        <div className="merr" style={{ marginBottom: 12, background: 'var(--abg)', color: 'var(--atx)' }}>
          This workbook also has {detection.label.toLowerCase().includes('contractors') ? 'contractor and ' : ''}QuickBooks sheets. Import those from the{' '}
          <Link to={`/job-import/${projectId}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
            Job import screen
          </Link>
          .
        </div>
      )}
      <EstimateImportSection projectId={projectId} estimateId={estimateId} initialFile={initialFile} onImported={onImported} />
      <div className="ma">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
