import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconFileSpreadsheet, IconMicrophone, IconVideo, IconX } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { isAudioFile, isVideoFile } from '../../lib/siteWalkMedia';
import { setPendingSiteWalk } from '../../lib/siteWalkHandoff';
import { setPendingImport, type FileDetection } from '../../lib/importHandoff';
import type { Client, Estimate, Project } from '../../types';

type Step = 'address' | 'name' | 'media';

// One file the person added on the last step, and what it was worked out to be.
interface PickedFile {
  file: File;
  kind: 'media' | 'import';
  label: string; // shown next to the name: "Video", "Estimate sheet", "In-house workbook (...)"
  detection?: FileDetection;
  detecting?: boolean;
}

const SPREADSHEET = /\.(xlsx|xlsm|xls)$/i;
const SCAN = /\.(pdf|jpe?g|png)$/i;
const STEPS: Step[] = ['address', 'name', 'media'];

// A guided, one-question-at-a-time way to start a project: the address, what to
// call it (and who it's for), then an optional video or voice memo that starts
// the estimate. Editing an existing project still uses the full form.
export function NewProjectWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>('address');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients).catch(() => {});
  }, []);

  useEffect(() => {
    firstField.current?.focus();
  }, [step]);

  const stepIndex = STEPS.indexOf(step);

  function goNext() {
    setError('');
    if (step === 'address') {
      // Offer the address as the project's name unless they've already typed one.
      if (!nameEdited && address.trim()) setName(address.trim());
      setStep('name');
    } else if (step === 'name') {
      if (!name.trim()) {
        setError('Give the project a name so you can find it later.');
        return;
      }
      setStep('media');
    }
  }

  function goBack() {
    setError('');
    setStep(STEPS[Math.max(0, stepIndex - 1)]);
  }

  function addFiles(list: FileList | File[]) {
    const added: PickedFile[] = [];
    for (const file of Array.from(list)) {
      if (isVideoFile(file)) added.push({ file, kind: 'media', label: 'Video' });
      else if (isAudioFile(file)) added.push({ file, kind: 'media', label: 'Voice memo' });
      else if (SPREADSHEET.test(file.name)) added.push({ file, kind: 'import', label: 'Spreadsheet', detecting: true });
      else if (SCAN.test(file.name)) {
        added.push({
          file,
          kind: 'import',
          label: 'Scanned document (will be read as an estimate)',
          detection: { kind: 'scan', has_estimate: true, has_inhouse: false, sheets: [], label: 'Scanned document' },
        });
      }
    }
    if (added.length === 0) {
      setError('Add a video, voice memo, spreadsheet (.xlsx or .xls), or a scan (PDF or photo).');
      return;
    }
    setError('');
    setFiles((prev) => [...prev, ...added]);
    // Spreadsheets: ask the server what's in them (estimate sheet, in-house
    // workbook...) so the right import runs without asking.
    for (const item of added.filter((a) => a.detecting)) {
      const form = new FormData();
      form.append('file', item.file);
      api
        .postForm<FileDetection>('/job-import/detect', form)
        .then((detection) =>
          setFiles((prev) => prev.map((f) => (f.file === item.file ? { ...f, detecting: false, detection, label: detection.label } : f)))
        )
        .catch(() => setFiles((prev) => prev.map((f) => (f.file === item.file ? { ...f, detecting: false, label: "Couldn't read this file" } : f))));
    }
  }

  async function create(withMedia: boolean) {
    setSaving(true);
    setError('');
    let project: Project;
    try {
      project = await api.post<Project>('/projects', {
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zip: zip.trim() || null,
        status: 'lead',
        client_id: clientId || null,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create the project');
      setSaving(false);
      return;
    }
    if (!withMedia || files.length === 0) {
      setSaving(false);
      onCreated(project);
      return;
    }
    // Spreadsheets and scans go to the Job import screen, each routed to the
    // import it belongs to (the estimate sheet, the in-house sheet).
    const importFiles = files.filter((f) => f.kind === 'import' && f.detection && (f.detection.has_estimate || f.detection.has_inhouse));
    if (importFiles.length > 0) {
      setPendingImport(importFiles.map((f) => ({ file: f.file, detection: f.detection! })));
      if (files.some((f) => f.kind === 'media')) {
        toast('Add your video from the estimate afterwards: "Draft from site walk video"');
      }
      setSaving(false);
      onClose();
      navigate(`/job-import/${project.id}`);
      return;
    }
    // Videos / voice memos: start the estimate and hand the files to its site walk window.
    try {
      const estimate = await api.post<Estimate>('/estimates', { project_id: project.id, version: 1, status: 'draft', pm_fee_total: 0 });
      setPendingSiteWalk(files.filter((f) => f.kind === 'media').map((f) => f.file));
      setSaving(false);
      onClose();
      navigate(`/estimates/${estimate.id}`);
    } catch (e) {
      setSaving(false);
      toast(e instanceof ApiError ? `Project created, but the estimate didn't start: ${e.message}` : 'Project created, but the estimate didn\'t start', true);
      onCreated(project);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step !== 'media') goNext();
    else void create(files.length > 0);
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }} aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= stepIndex ? 'var(--accent)' : 'var(--border-md)' }} />
          ))}
        </div>
        {error && <div className="merr">{error}</div>}

        {step === 'address' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Congratulations on a new project!</div>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 16 }}>What's the address?</p>
            <div className="fg">
              <input ref={firstField} className="fi" style={{ fontSize: 16 }} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="4040 N Park Ave" />
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">City</label>
                <input className="fi" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Indianapolis" />
              </div>
              <div className="fg" style={{ maxWidth: 90 }}>
                <label className="fl">State</label>
                <input className="fi" value={state} onChange={(e) => setState(e.target.value)} placeholder="IN" />
              </div>
              <div className="fg" style={{ maxWidth: 130 }}>
                <label className="fl">Zip</label>
                <input className="fi" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="46205" />
              </div>
            </div>
            <p style={{ color: 'var(--t3)', fontSize: 12 }}>Don't have it yet? You can skip this and add it later.</p>
          </>
        )}

        {step === 'name' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>What should we call it?</div>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 16 }}>Something you'll recognize in a list -- the address or the client's name works well.</p>
            <div className="fg">
              <input
                ref={firstField}
                className="fi"
                style={{ fontSize: 16 }}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                placeholder="4040 N Park Ave - Smith kitchen"
              />
            </div>
            <div className="fg">
              <label className="fl">Who's it for? (optional)</label>
              <select className="fi" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— No client yet —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed client'}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {step === 'media' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Got files for the job?</div>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 16 }}>
              Drop a walk-through video or a voice memo and I'll draft the estimate from what you say and show. Or drop an estimate or in-house spreadsheet
              (or a scan) and I'll import it. I work out which is which, and you review everything before it's added.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                addFiles(e.dataTransfer.files);
              }}
              style={{
                border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-md)'}`,
                borderRadius: 'var(--r)',
                padding: 22,
                textAlign: 'center',
                background: dragOver ? 'var(--brand-cream)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, color: 'var(--t3)' }}>
                <IconVideo size={26} />
                <IconMicrophone size={26} />
              </div>
              <div style={{ margin: '6px 0 10px', fontSize: 13 }}>Drop videos, voice memos, spreadsheets or scans here</div>
              <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                Choose files
                <input type="file" accept="video/*,audio/*,.mov,.mp4,.m4v,.m4a,.mp3,.wav,.xlsx,.xlsm,.xls,.pdf,.jpg,.jpeg,.png" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && addFiles(e.target.files)} />
              </label>
            </div>
            {files.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                    {f.kind === 'import' ? <IconFileSpreadsheet size={14} /> : isAudioFile(f.file) ? <IconMicrophone size={14} /> : <IconVideo size={14} />}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</span>
                    <span className="badge bg-gray" title="What this file looks like">{f.detecting ? 'Checking…' : f.label}</span>
                    <span style={{ color: 'var(--t3)' }}>{Math.max(1, Math.round(f.file.size / 1048576))} MB</span>
                    <button type="button" className="btn-reset" title="Remove" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                      <IconX size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="ma" style={{ justifyContent: 'space-between' }}>
          <div>
            {step !== 'address' && (
              <button type="button" className="btn" onClick={goBack} disabled={saving}>
                Back
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step === 'address' && (
              <button type="button" className="btn" onClick={goNext}>
                Skip
              </button>
            )}
            {step === 'media' && (
              <button type="button" className="btn" onClick={() => create(false)} disabled={saving}>
                {saving && files.length === 0 ? 'Creating…' : 'Skip'}
              </button>
            )}
            <button type="submit" className="btn btn-p" disabled={saving || files.some((f) => f.detecting)}>
              {step === 'media' ? (saving ? 'Creating…' : files.some((f) => f.kind === 'import') ? 'Create & import' : files.length > 0 ? 'Create & draft the estimate' : 'Create project') : 'Next'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
