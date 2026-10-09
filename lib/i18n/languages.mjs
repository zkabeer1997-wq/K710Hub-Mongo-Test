// The ten member languages. English is the source; the rest ship as JSON files in i18n/locales/.
// `native` is shown large in the picker, `english` small. `google` is the Cloud Translation code.
export const LANGUAGES = [
  { code: 'en', native: 'English', english: 'English', dir: 'ltr', google: 'en' },
  { code: 'ko', native: '한국어', english: 'Korean', dir: 'ltr', google: 'ko' },
  { code: 'tl', native: 'Filipino', english: 'Tagalog', dir: 'ltr', google: 'tl' },
  { code: 'ar', native: 'العربية', english: 'Arabic', dir: 'rtl', google: 'ar' },
  { code: 'es', native: 'Español', english: 'Spanish', dir: 'ltr', google: 'es' },
  { code: 'fr', native: 'Français', english: 'French', dir: 'ltr', google: 'fr' },
  { code: 'zh', native: '中文', english: 'Chinese', dir: 'ltr', google: 'zh-CN' },
  { code: 'tr', native: 'Türkçe', english: 'Turkish', dir: 'ltr', google: 'tr' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', dir: 'ltr', google: 'hi' },
  { code: 'ja', native: '日本語', english: 'Japanese', dir: 'ltr', google: 'ja' },
];

export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'k710-language-v1';
export const LANGUAGE_COOKIE = 'k710-language';
export const NON_ENGLISH = LANGUAGES.filter((l) => l.code !== 'en').map((l) => l.code);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));
// Values written by the old (Chrome translator) system were English names such as "Spanish".
const ALIASES = new Map([
  ['filipino', 'tl'], ['fil', 'tl'], ['tagalog', 'tl'],
  ['zh-cn', 'zh'], ['zh-hans', 'zh'], ['zh-tw', 'zh'], ['chinese', 'zh'],
  ...LANGUAGES.flatMap((l) => [[l.code, l.code], [l.english.toLowerCase(), l.code], [l.native.toLowerCase(), l.code]]),
]);

/** Any stored/legacy/browser value -> one of the ten codes, or null when unknown. */
export function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  return ALIASES.get(raw) || ALIASES.get(raw.split(/[-_]/)[0]) || null;
}

export function getLanguage(code) {
  return BY_CODE.get(normalizeLanguage(code) || DEFAULT_LANGUAGE);
}

export function languageDir(code) {
  return getLanguage(code).dir;
}
