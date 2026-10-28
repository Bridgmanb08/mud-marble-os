import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Foreman } from '../types';

// The foremen list, loaded once per screen. A failure (e.g. the foremen table
// not created yet) just means "no foremen" -- never an error on the page.
export function useForemen() {
  const [foremen, setForemen] = useState<Foreman[]>([]);
  const reload = useCallback(() => {
    api
      .get<Foreman[]>('/foremen')
      .then(setForemen)
      .catch(() => setForemen([]));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const byId = new Map(foremen.map((f) => [f.id, f]));
  return { foremen, byId, reload };
}
