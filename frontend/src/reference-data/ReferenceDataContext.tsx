import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { CostCode, Subcontractor } from '../types';

interface ReferenceDataValue {
  subcontractors: Subcontractor[] | null;
  costCodes: CostCode[] | null;
  refreshSubcontractors: () => Promise<void>;
  refreshCostCodes: () => Promise<void>;
}

const ReferenceDataContext = createContext<ReferenceDataValue | null>(null);

export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const [subcontractors, setSubcontractors] = useState<Subcontractor[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[] | null>(null);

  const refreshSubcontractors = useCallback(async () => {
    setSubcontractors(await api.get<Subcontractor[]>('/subcontractors'));
  }, []);

  const refreshCostCodes = useCallback(async () => {
    setCostCodes(await api.get<CostCode[]>('/transactions/cost-codes'));
  }, []);

  useEffect(() => {
    Promise.all([refreshSubcontractors(), refreshCostCodes()]).catch(() => {});
  }, [refreshSubcontractors, refreshCostCodes]);

  return (
    <ReferenceDataContext.Provider value={{ subcontractors, costCodes, refreshSubcontractors, refreshCostCodes }}>
      {children}
    </ReferenceDataContext.Provider>
  );
}

export function useReferenceData() {
  const ctx = useContext(ReferenceDataContext);
  if (!ctx) throw new Error('useReferenceData must be used within ReferenceDataProvider');
  return ctx;
}
