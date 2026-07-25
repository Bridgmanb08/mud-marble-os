import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { TagChip } from './TagChip';
import { TagPicker } from './TagPicker';
import type { PersonTag } from '../../types';

type EntityType = 'client' | 'subcontractor' | 'lead';

export function EntityTagList({
  entityType,
  entityId,
  allTags,
}: {
  entityType: EntityType;
  entityId: string;
  allTags: PersonTag[];
}) {
  const [tags, setTags] = useState<PersonTag[] | null>(null);
  const toast = useToast();

  async function load() {
    try {
      setTags(await api.get<PersonTag[]>(`/person-tags/for/${entityType}/${entityId}`));
    } catch {
      setTags([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const availableToAdd = useMemo(() => {
    const attachedIds = new Set((tags ?? []).map((t) => t.id));
    return allTags.filter((t) => !attachedIds.has(t.id));
  }, [tags, allTags]);

  async function handleAdd(tagId: string) {
    try {
      await api.post(`/person-tags/${tagId}/attach`, { entity_type: entityType, entity_id: entityId });
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to add tag', true);
    }
  }

  async function handleRemove(tagId: string) {
    try {
      await api.delete(
        `/person-tags/${tagId}/detach?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`
      );
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to remove tag', true);
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {(tags ?? []).map((t) => (
        <TagChip key={t.id} tag={t} onRemove={() => handleRemove(t.id)} />
      ))}
      <TagPicker tags={availableToAdd} onAdd={handleAdd} />
    </div>
  );
}
