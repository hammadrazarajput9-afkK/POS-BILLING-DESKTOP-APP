import { useState, useEffect, useCallback } from 'react';
import { useFormDraftContext } from '../context/FormDraftContext';

/**
 * Hook to persist form drafts across tab navigations, modal closures, and page reloads.
 * State resets ONLY when resetDraft() is called (explicit Cancel or Successful Submit).
 */
export function useFormDraft<T>(formKey: string, initialValue: T): [T, (val: T | ((prev: T) => T)) => void, () => void, boolean] {
  const { getDraft, setDraft, clearDraft, hasDraft } = useFormDraftContext();

  const [value, setValueInternal] = useState<T>(() => getDraft<T>(formKey, initialValue));

  // Sync if context drafts change (e.g., loaded from IndexedDB)
  useEffect(() => {
    const current = getDraft<T>(formKey, initialValue);
    setValueInternal(current);
  }, [formKey, getDraft]);

  const updateDraft = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValueInternal(prev => {
        const next = typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
        setDraft(formKey, next);
        return next;
      });
    },
    [formKey, setDraft]
  );

  const resetDraft = useCallback(() => {
    setValueInternal(initialValue);
    clearDraft(formKey);
  }, [formKey, initialValue, clearDraft]);

  const isDraftActive = hasDraft(formKey);

  return [value, updateDraft, resetDraft, isDraftActive];
}
