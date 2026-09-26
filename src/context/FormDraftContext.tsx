import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  const [drafts, setDrafts] = useState<Record<string, any>>(() => {
    // Initial sync from localStorage for immediate availability
    const initial: Record<string, any> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DRAFT_PREFIX)) {
          const draftKey = key.replace(DRAFT_PREFIX, '');
          const val = localStorage.getItem(key);
          if (val) {
            initial[draftKey] = JSON.parse(val);
          }
        }
      }
    } catch (e) {
      console.warn('Could not read drafts from localStorage', e);
    }
    return initial;
  });

  // Reconcile with IndexedDB on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const keys = [
          'pos_cart',
          'pos_customer',
          'expense_form',
          'stock_form',
          'khata_add_form',
          'khata_settle_form',
          'purchase_form',
        ];
        for (const k of keys) {
          const saved = await getDraftFromDB(k);
          if (saved && mounted) {
            setDrafts(prev => ({
              ...prev,
              [k]: saved,
            }));
          }
        }
      } catch (err) {
        console.error('Failed to load drafts from IndexedDB:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const getDraft = useCallback(
    <T,>(key: string, fallback: T): T => {
      if (drafts[key] !== undefined && drafts[key] !== null) {
        return drafts[key] as T;
      }
      return fallback;
    },
    [drafts]
  );

  const setDraft = useCallback(<T,>(key: string, data: T) => {
    setDrafts(prev => ({ ...prev, [key]: data }));
    // Persist to both IndexedDB and localStorage
    saveDraftToDB(key, data).catch(console.error);
    try {
      localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(data));
    } catch (e) {
      // Ignore if quota exceeded
    }
  }, []);

  const clearDraft = useCallback((key: string) => {
    setDrafts(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    clearDraftFromDB(key).catch(console.error);
    try {
      localStorage.removeItem(DRAFT_PREFIX + key);
    } catch (e) {
      // Ignore
    }
  }, []);

  const hasDraft = useCallback(
    (key: string): boolean => {
      return drafts[key] !== undefined && drafts[key] !== null;
    },
    [drafts]
  );

  return (
    <FormDraftContext.Provider
      value={{
        drafts,
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
