// Loads catalogs for client and server components. English ships with every page (it is the
// fallback); every other language is a separate lazily loaded chunk, so a visitor only downloads
// the one language they use. A missing or malformed locale file resolves to {} (English fallback).
import en from '../../i18n/en.json';
import { flattenSource, sanitizeMessages, createTranslator } from './translate.mjs';
import { normalizeLanguage, DEFAULT_LANGUAGE } from './languages.mjs';

export const ENGLISH = flattenSource(en);

const LOADERS = {
  ko: () => import('../../i18n/locales/ko.json'),
  tl: () => import('../../i18n/locales/tl.json'),
  ar: () => import('../../i18n/locales/ar.json'),
  es: () => import('../../i18n/locales/es.json'),
  fr: () => import('../../i18n/locales/fr.json'),
  zh: () => import('../../i18n/locales/zh.json'),
  tr: () => import('../../i18n/locales/tr.json'),
  hi: () => import('../../i18n/locales/hi.json'),
  ja: () => import('../../i18n/locales/ja.json'),
};

/** @returns {Promise<Record<string,string>>} flat messages for a language ({} for English or on any failure) */
export async function loadMessages(code) {
  const lang = normalizeLanguage(code) || DEFAULT_LANGUAGE;
  const loader = LOADERS[lang];
  if (!loader) return {};
  try {
    const mod = await loader();
    return sanitizeMessages(mod?.default ?? mod);
  } catch {
    return {};
  }
}

/** Server components: `const t = await getTranslator(code)`. */
export async function getTranslator(code) {
  const lang = normalizeLanguage(code) || DEFAULT_LANGUAGE;
  return createTranslator({ locale: lang, messages: await loadMessages(lang), fallback: ENGLISH });
}
