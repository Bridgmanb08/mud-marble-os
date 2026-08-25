import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { RentRollRow } from '../types';

// Dedupes concurrent fetches of GET /rentals/rent-roll -- five dashboard
// widgets (Collection, Late, Occupancy, Renewals, Visits) each used to
// independently call this endpoint on mount, meaning opening the dashboard
// with all five visible issued five identical, simultaneous network
// requests. Only the in-flight PROMISE is shared, not the resolved data --
// once a fetch settles, `inFlight` is cleared so the next mount (e.g.
// navigating back to the dashboard later) gets a fresh read rather than an
// indefinitely-stale one. This still fully dedupes the "N widgets mounting
// together" case, since they all call fetchRentRoll() before the first
// request's microtask resolves and so share the one in-flight promise.
let inFlight: Promise<RentRollRow[]> | null = null;

function fetchRentRoll(): Promise<RentRollRow[]> {
  if (!inFlight) {
    inFlight = api.get<RentRollRow[]>('/rentals/rent-roll').finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function useRentRoll() {
  const [rows, setRows] = useState<RentRollRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRentRoll()
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, error };
}
