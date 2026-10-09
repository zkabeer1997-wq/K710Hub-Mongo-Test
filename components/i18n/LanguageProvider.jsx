'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { createTranslator } from '../../lib/i18n/translate.mjs';
import { ENGLISH, loadMessages } from '../../lib/i18n/catalog';
import {
  DEFAULT_LANGUAGE, LANGUAGE_COOKIE, LANGUAGE_STORAGE_KEY, getLanguage, normalizeLanguage,
} from '../../lib/i18n/languages.mjs';
import LanguagePicker from './LanguagePicker';

// "Translate once, ship as files": the page text comes from i18n/en.json plus one lazily loaded
// locale file (i18n/locales/<code>.json). No in-browser translation, no network call per visitor.
// The layout reads the language cookie, so the first server render is already in the right language.
const english = createTranslator({ locale: 'en', messages: {}, fallback: ENGLISH });

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  languageName: 'English',
  languageCode: 'EN',
  hasChosenLanguage: true,
  translationStatus: 'idle',
  t: english,
  setLanguage: () => {},
  openLanguageChooser: () => {},
});

/** Translator + language for any client component. Safe outside the provider (English). */
export function useLanguage() {
  return useContext(LanguageContext);
}
export function useT() {
  return useContext(LanguageContext).t;
}

function applyToDocument(code) {
  const lang = getLanguage(code);
  document.documentElement.lang = lang.code === 'zh' ? 'zh-Hans' : lang.code;
  document.documentElement.dir = lang.dir;
}

function writePreference(code) {
  try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code); } catch { /* private mode */ }
  try { document.cookie = `${LANGUAGE_COOKIE}=${code}; Path=/; Max-Age=31536000; SameSite=Lax`; } catch { /* cookies blocked */ }
}

export default function LanguageProvider({ children, initialLanguage = DEFAULT_LANGUAGE, initialMessages = {} }) {
  const startCode = normalizeLanguage(initialLanguage) || DEFAULT_LANGUAGE;
  const [code, setCode] = useState(startCode);
  const [messages, setMessages] = useState(initialMessages);
  const [chooserOpen, setChooserOpen] = useState(false);
  const openerRef = useRef(null);
  const cache = useRef({ [startCode]: initialMessages });
  const latest = useRef(startCode);

  const switchTo = useCallback(async (next, { persist = true } = {}) => {
    const target = normalizeLanguage(next) || DEFAULT_LANGUAGE;
    latest.current = target;
    if (persist) writePreference(target);
    let loaded = cache.current[target];
    if (!loaded) {
      loaded = await loadMessages(target);
      cache.current[target] = loaded;
    }
    if (latest.current !== target) return; // a newer choice won
    applyToDocument(target);
    setMessages(loaded);
    setCode(target);
  }, []);

  // A saved choice on this device wins when the server did not know it yet (first visit after the cookie was cleared).
  useEffect(() => {
    let saved = null;
    try { saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch { saved = null; }
    const normalized = normalizeLanguage(saved);
    if (normalized && normalized !== startCode) switchTo(normalized);
    else if (normalized) writePreference(normalized);
    else applyToDocument(startCode);
  }, [startCode, switchTo]);

  const openLanguageChooser = useCallback(() => {
    openerRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    setChooserOpen(true);
  }, []);

  const closeLanguageChooser = useCallback(() => {
    setChooserOpen(false);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && typeof opener.focus === 'function' && opener.isConnected) window.setTimeout(() => opener.focus(), 0);
  }, []);

  const choose = useCallback((next) => {
    switchTo(next);
    closeLanguageChooser();
  }, [switchTo, closeLanguageChooser]);

  const t = useMemo(() => createTranslator({ locale: code, messages, fallback: ENGLISH }), [code, messages]);
  const lang = getLanguage(code);
  const value = useMemo(() => ({
    language: code,
    languageName: lang.native,
    languageCode: code.toUpperCase(),
    hasChosenLanguage: true, // never blocks the page; the forge intro used to wait for this
    translationStatus: 'idle',
    t,
    setLanguage: switchTo,
    openLanguageChooser,
  }), [code, lang.native, t, switchTo, openLanguageChooser]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
      {chooserOpen && <LanguagePicker current={code} t={t} onChoose={choose} onClose={closeLanguageChooser} />}
    </LanguageContext.Provider>
  );
}
