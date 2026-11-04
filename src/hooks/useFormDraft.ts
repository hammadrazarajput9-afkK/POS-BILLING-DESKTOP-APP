import { useState, useCallback, useRef } from 'react';
import { useFormDraftContext } from '../context/FormDraftContext';

/**
 * Hook to persist form drafts across tab navigations, modal closures, and page reloads.
 * State resets ONLY when resetDraft() is called (explicit Cancel or Successful Submit).
 */
export function useFormDraft<T>(
  formKey: string,
  initialValue: T
): [T, (val: T | ((prev: T) => T)) => void, () => void, boolean] {
  const { getDraft, setDraft, clearDraft, hasDraft } = useFormDraftContext();

  const [value, setValueInternal] = useState<T>(() => getDraft<T>(formKey, initialValue));
  const [isDraftActive, setIsDraftActive] = useState<boolean>(() => hasDraft(formKey));

  const valueRef = useRef<T>(value);
  valueRef.current = value;

  const updateDraft = useCallback(
    (updater: T | ((prev: T) => T)) => {
      const next = typeof updater === 'function' ? (updater as (prev: T) => T)(valueRef.current) : updater;
      valueRef.current = next;
      setValueInternal(next);
      setIsDraftActive(true);
      // Persist draft to storage without executing setState inside an updater function
      setDraft(formKey, next);
    },
    [formKey, setDraft]
  );

  const resetDraft = useCallback(() => {
    valueRef.current = initialValue;
    setValueInternal(initialValue);
    setIsDraftActive(false);
    clearDraft(formKey);
  }, [formKey, initialValue, clearDraft]);

  return [value, updateDraft, resetDraft, isDraftActive];
}
