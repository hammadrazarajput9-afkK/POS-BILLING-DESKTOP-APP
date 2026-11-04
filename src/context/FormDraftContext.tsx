import React, { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { getDraftFromDB, saveDraftToDB, clearDraftFromDB } from '../utils/db';

interface FormDraftContextType {
  drafts: Record<string, any>;
  getDraft: <T>(key: string, fallback: T) => T;
  setDraft: <T>(key: string, data: T) => void;
  clearDraft: (key: string) => void;
  hasDraft: (key: string) => boolean;
}

const FormDraftContext = createContext<FormDraftContextType | null>(null);

const DRAFT_PREFIX = 'MOBILEPOS_DRAFT_';

export const FormDraftProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use a ref for in-memory draft storage so setting a draft does NOT trigger
  // a re-render of FormDraftProvider and the entire component tree, which
  // avoids "Cannot update a component while rendering a different component"
  const draftsRef = useRef<Record<string, any>>({});

  // Sync initial drafts from localStorage for immediate availability
  if (Object.keys(draftsRef.current).length === 0) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DRAFT_PREFIX)) {
          const draftKey = key.replace(DRAFT_PREFIX, '');
          const val = localStorage.getItem(key);
          if (val) {
            draftsRef.current[draftKey] = JSON.parse(val);
          }
        }
      }
    } catch (e) {
      console.warn('Could not read drafts from localStorage', e);
    }
  }

  // Reconcile with IndexedDB on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const keys = [
          'pos_cart',
          'pos_customer',
          'pos_terminal_draft',
          'expense_form',
          'stock_form',
          'stock_add_modal_form_v2',
          'khata_add_form',
          'khata_settle_form',
          'purchase_form',
        ];
        for (const k of keys) {
          const saved = await getDraftFromDB(k);
          if (saved && mounted) {
            draftsRef.current[k] = saved;
          }
        }
      } catch (err) {
        console.warn('Failed to load drafts from IndexedDB:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const getDraft = useCallback(<T,>(key: string, fallback: T): T => {
    if (draftsRef.current[key] !== undefined && draftsRef.current[key] !== null) {
      return draftsRef.current[key] as T;
    }
    try {
      const val = localStorage.getItem(DRAFT_PREFIX + key);
      if (val) {
        const parsed = JSON.parse(val);
        draftsRef.current[key] = parsed;
        return parsed as T;
      }
    } catch {
      // Fallback
    }
    return fallback;
  }, []);

  const setDraft = useCallback(<T,>(key: string, data: T) => {
    draftsRef.current[key] = data;
    try {
      localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(data));
    } catch (e) {
      // Ignore if quota exceeded
    }
    saveDraftToDB(key, data).catch(() => {});
  }, []);

  const clearDraft = useCallback((key: string) => {
    delete draftsRef.current[key];
    try {
      localStorage.removeItem(DRAFT_PREFIX + key);
    } catch (e) {
      // Ignore
    }
    clearDraftFromDB(key).catch(() => {});
  }, []);

  const hasDraft = useCallback((key: string): boolean => {
    if (draftsRef.current[key] !== undefined && draftsRef.current[key] !== null) {
      return true;
    }
    try {
      return localStorage.getItem(DRAFT_PREFIX + key) !== null;
    } catch {
      return false;
    }
  }, []);

  return (
    <FormDraftContext.Provider
      value={{
        drafts: draftsRef.current,
        getDraft,
        setDraft,
        clearDraft,
        hasDraft,
      }}
    >
      {children}
    </FormDraftContext.Provider>
  );
};

export function useFormDraftContext() {
  const ctx = useContext(FormDraftContext);
  if (!ctx) {
    throw new Error('useFormDraftContext must be used within a FormDraftProvider');
  }
  return ctx;
}
