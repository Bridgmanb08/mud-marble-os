import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconTrash, IconChevronDown, IconChevronRight, IconGripVertical, IconPaperclip, IconX } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { fmt } from '../../lib/format';
import { uploadProjectFile } from '../../lib/fileUpload';
import { FilePreviewModal } from '../projects/FilePreviewModal';
import type { EstimateLineItem, ProjectFile, ProjectSubItem, Subcontractor } from '../../types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ProjectSubcontractorCardProps {
  projectId: string;
  subcontractor: Subcontractor;
  items: ProjectSubItem[];
  lineItems: EstimateLineItem[];
  paid: number;
  onChanged: () => void;
}

function AmountInput({ item, onSaved }: { item: ProjectSubItem; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(String(item.amount));

  async function commit() {
    const amt = parseFloat(value);
    if (!amt || amt === item.amount) {
      setValue(String(item.amount));
      return;
    }
    try {
      await api.patch(`/subcontractor-items/${item.id}`, { amount: amt });
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update amount', true);
      setValue(String(item.amount));
    }
  }

  return (
    <input
      className="fi"
      type="number"
      style={{ width: 110, fontSize: 13, fontWeight: 500, textAlign: 'right' }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function DescriptionInput({ item, onSaved }: { item: ProjectSubItem; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(item.description || '');

  async function commit() {
    const trimmed = value.trim();
    if (trimmed === (item.description || '')) return;
    try {
      // Send the (possibly empty) string as-is rather than null -- the
      // backend's PATCH excludes null fields entirely, which would silently
      // drop a deliberate clear instead of persisting it.
      await api.patch(`/subcontractor-items/${item.id}`, { description: trimmed });
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update description', true);
      setValue(item.description || '');
    }
  }

  return (
    <input
      className="fi"
      style={{ width: '100%', fontSize: 13 }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      placeholder="Line item description"
    />
  );
}

function ConfirmationRow({ item, projectId, onSaved }: { item: ProjectSubItem; projectId: string; onSaved: () => void }) {
  const toast = useToast();
  const [confirmed, setConfirmed] = useState(item.confirmed);
  const [confirmedAt, setConfirmedAt] = useState(item.confirmed_at || '');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadFiles() {
    setFiles(await api.get<ProjectFile[]>(`/projects/${projectId}/files?subitem_id=${item.id}`).catch(() => []));
  }

  useEffect(() => {
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function toggleConfirmed() {
    const next = !confirmed;
    const nextDate = next && !confirmedAt ? todayIso() : confirmedAt;
    setConfirmed(next);
    setConfirmedAt(nextDate);
    try {
      await api.patch(`/subcontractor-items/${item.id}`, { confirmed: next, confirmed_at: nextDate || undefined });
      onSaved();
    } catch (err) {
      setConfirmed(!next);
      toast(err instanceof ApiError ? err.message : 'Failed to update confirmation', true);
    }
  }

  async function commitDate() {
    if (confirmedAt === (item.confirmed_at || '')) return;
    try {
      await api.patch(`/subcontractor-items/${item.id}`, { confirmed_at: confirmedAt || undefined });
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update confirmation date', true);
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await uploadProjectFile(projectId, file, [], [item.id]);
      }
      await loadFiles();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', true);
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(fileId: string) {
    try {
      await api.delete(`/files/${fileId}/subitems/${item.id}`);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to remove file', true);
    }
  }

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingLeft: 22, paddingBottom: 8 }}
      onClick={(e) => e.stopPropagation()}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={confirmed} onChange={toggleConfirmed} />
        Confirmed with subcontractor
      </label>
      <input
        type="date"
        className="fi"
        style={{ width: 140, fontSize: 12, padding: '3px 6px' }}
        value={confirmedAt}
        onChange={(e) => setConfirmedAt(e.target.value)}
        onBlur={commitDate}
      />
      {files.map((f) => (
        <span
          key={f.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11.5,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '2px 4px 2px 8px',
          }}
        >
          <span style={{ cursor: 'pointer' }} onClick={() => setPreview(f)} title="Click to preview">
            {f.file_name}
          </span>
          <button
            type="button"
            className="btn-reset"
            style={{ display: 'flex', color: 'var(--t3)' }}
            onClick={() => removeFile(f.id)}
            title="Remove"
          >
            <IconX size={11} />
          </button>
        </span>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        <IconPaperclip size={12} /> {uploading ? 'Uploading…' : 'Attach screenshot'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleUpload(e.target.files)}
      />
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function SortableSubItemRow({
  item,
  projectId,
  onSaved,
  onDelete,
}: {
  item: ProjectSubItem;
  projectId: string;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        padding: '6px 0',
        borderBottom: '1px solid var(--border)',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? 'var(--surface)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="btn-reset"
          {...attributes}
          {...listeners}
          style={{ display: 'flex', flexShrink: 0, cursor: 'grab', color: 'var(--t3)', touchAction: 'none' }}
          title="Drag to reorder"
        >
          <IconGripVertical size={14} />
        </button>
        <div style={{ flex: 1 }}>
          <DescriptionInput item={item} onSaved={onSaved} />
          {item.builder_cost != null && (
            <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>Est. builder cost: {fmt(item.builder_cost)}</div>
          )}
        </div>
        <AmountInput item={item} onSaved={onSaved} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(item.id)}>
          <IconTrash size={13} />
        </button>
      </div>
      <ConfirmationRow item={item} projectId={projectId} onSaved={onSaved} />
    </div>
  );
}

export function ProjectSubcontractorCard({ projectId, subcontractor, items, lineItems, paid, onChanged }: ProjectSubcontractorCardProps) {
  const toast = useToast();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const descriptionRef = useRef<HTMLInputElement>(null);

  const contracted = items.reduce((s, i) => s + (i.amount || 0), 0);
  const remaining = contracted - paid;
  const linkedLineItemIds = new Set(items.map((i) => i.source_line_item_id).filter(Boolean));

  async function addItem(focusAfter = false) {
    const amt = parseFloat(amount);
    if (!amt) return;
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/subcontractor-items`, {
        subcontractor_id: subcontractor.id,
        description: description.trim() || null,
        amount: amt,
        sort_order: items.length,
      });
      setDescription('');
      setAmount('');
      onChanged();
      if (focusAfter) descriptionRef.current?.focus();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to add contract item', true);
    } finally {
      setSaving(false);
    }
  }

  // Shift+Enter adds the current line and refocuses the description field so
  // several contract items can be typed in quick succession without reaching
  // for the mouse each time -- plain Enter is left alone.
  function handleQuickAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      addItem(true);
    }
  }

  async function deleteItem(id: string) {
    try {
      await api.delete(`/subcontractor-items/${id}`);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to remove item', true);
    }
  }

  async function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    const changed = reordered
      .map((item, i) => ({ id: item.id, oldOrder: item.sort_order, newOrder: i }))
      .filter(({ oldOrder, newOrder }) => oldOrder !== newOrder);
    if (changed.length === 0) return;
    try {
      await Promise.all(changed.map(({ id: itemId, newOrder }) => api.patch(`/subcontractor-items/${itemId}`, { sort_order: newOrder })));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save the new order', true);
    } finally {
      onChanged();
    }
  }

  async function toggleLineItem(li: EstimateLineItem) {
    const existing = items.find((i) => i.source_line_item_id === li.id);
    try {
      if (existing) {
        await api.delete(`/subcontractor-items/${existing.id}`);
      } else {
        await api.post(`/projects/${projectId}/subcontractor-items`, {
          subcontractor_id: subcontractor.id,
          description: li.title,
          amount: li.builder_cost,
          builder_cost: li.builder_cost,
          source_line_item_id: li.id,
          sort_order: items.length,
        });
      }
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update line item', true);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {subcontractor.company_name}
          {subcontractor.trade && <span style={{ fontWeight: 400, color: 'var(--t2)', fontSize: 12 }}> — {subcontractor.trade}</span>}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          <span>
            Contract: <strong>{fmt(contracted)}</strong>
          </span>
          <span style={{ color: 'var(--green)' }}>
            Paid: <strong>{fmt(paid)}</strong>
          </span>
          <span style={{ color: remaining > 0 ? 'var(--atx)' : 'var(--t2)' }}>
            Remaining: <strong>{fmt(remaining)}</strong>
          </span>
        </div>
      </div>
      <div style={{ padding: '8px 16px' }}>
        <DndContext sensors={sensors} onDragEnd={handleReorder}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableSubItemRow key={item.id} item={item} projectId={projectId} onSaved={onChanged} onDelete={deleteItem} />
            ))}
          </SortableContext>
        </DndContext>

        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowPicker((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {showPicker ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
            Add from estimate
          </button>
          {showPicker && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
              {lineItems.length === 0 ? (
                <div style={{ padding: 10, fontSize: 12, color: 'var(--t2)' }}>No estimate line items on this job yet.</div>
              ) : (
                lineItems.map((li) => (
                  <label
                    key={li.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={linkedLineItemIds.has(li.id)} onChange={() => toggleLineItem(li)} />
                    <span style={{ flex: 1, fontSize: 12 }}>{li.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--t2)' }}>{fmt(li.builder_cost)}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            ref={descriptionRef}
            className="fi"
            placeholder="Line item (e.g. Run new electrical) — Shift+Enter to add and keep going"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleQuickAddKeyDown}
          />
          <input
            className="fi"
            type="number"
            placeholder="Amount"
            style={{ maxWidth: 140 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={handleQuickAddKeyDown}
          />
          <button type="button" className="btn btn-sm" onClick={() => addItem()} disabled={saving || !amount}>
            Add
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ background: 'var(--gray-bg)', borderTop: '1px solid var(--border)', borderRadius: '0 0 8px 8px', padding: '14px 16px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
            {subcontractor.company_name}
            {subcontractor.trade && <span style={{ fontWeight: 400 }}> — {subcontractor.trade}</span>}
          </div>
          {items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
              <span>{item.description || '—'}</span>
              <span>{fmt(item.amount)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            <span>Total Contract</span>
            <span>{fmt(contracted)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
