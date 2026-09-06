'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'k710-language-v1';
const CACHE_PREFIX = 'k710-ui-translations-v3:';
const BATCH_SIZE = 40;

const LanguageContext = createContext({
  language: 'English',
  hasChosenLanguage: false,
  openLanguageChooser: () => {},
});

// See repository main branch for full provider implementation.
// Soft-gate bootstrap: first visit defaults to English without a blocking modal.
export function useLanguage() {
  return useContext(LanguageContext);
}

export default function LanguageProvider({ children }) {
  const pathname = usePathname();
  const [language, setLanguage] = useState('English');
  const [hasChosenLanguage, setHasChosenLanguage] = useState(true);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [inputLanguage, setInputLanguage] = useState('English');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setLanguage(saved);
        setInputLanguage(saved);
        setHasChosenLanguage(true);
        setChooserOpen(false);
      } else {
        localStorage.setItem(STORAGE_KEY, 'English');
        setHasChosenLanguage(true);
        setChooserOpen(false);
      }
    } catch {
      setHasChosenLanguage(true);
      setChooserOpen(false);
    }
  }, []);

  const openLanguageChooser = useCallback(() => setChooserOpen(true), []);

  const applyLanguage = useCallback((nextLanguage) => {
    const clean = String(nextLanguage || 'English').trim() || 'English';
    setLanguage(clean);
    setInputLanguage(clean);
    setHasChosenLanguage(true);
    setChooserOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, clean);
    } catch {
      // non-fatal
    }
  }, []);

  const value = useMemo(
    () => ({ language, hasChosenLanguage, openLanguageChooser }),
    [language, hasChosenLanguage, openLanguageChooser],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
      {chooserOpen && (
        <div className="k710-language-gate" role="dialog" aria-modal="true" aria-label="Choose language">
          <div className="k710-language-panel">
            <h2>Choose your language</h2>
            <input
              value={inputLanguage}
              onChange={(e) => setInputLanguage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyLanguage(inputLanguage);
              }}
            />
            <button type="button" onClick={() => applyLanguage(inputLanguage)}>
              Enter the Kingdom
            </button>
          </div>
        </div>
      )}
      {hasChosenLanguage && !chooserOpen && (
        <button
          type="button"
          className="k710-language-switcher"
          onClick={openLanguageChooser}
          data-k710-no-translate
          aria-label={`Change language. Current language: ${language}`}
        >
          <span aria-hidden="true">🌐</span>
          <span>{language}</span>
        </button>
      )}
    </LanguageContext.Provider>
  );
}
