// Language data + pure helpers shared by the provider, the header switcher and tests.
// (Moved out of components/i18n/LanguageProvider.jsx, behaviour unchanged.)

// Chrome's stable on-device Translator API currently supports these language
// families. These cover the principal K710 languages without any cloud API.
export const SUGGESTED_LANGUAGES = [
  ['English', 'English'],
  ['Arabic', 'العربية'],
  ['French', 'Français'],
  ['Turkish', 'Türkçe'],
  ['Korean', '한국어'],
  ['Spanish', 'Español'],
  ['German', 'Deutsch'],
  ['Portuguese', 'Português'],
  ['Italian', 'Italiano'],
  ['Dutch', 'Nederlands'],
  ['Polish', 'Polski'],
  ['Russian', 'Русский'],
  ['Ukrainian', 'Українська'],
  ['Greek', 'Ελληνικά'],
  ['Romanian', 'Română'],
  ['Czech', 'Čeština'],
  ['Hungarian', 'Magyar'],
  ['Swedish', 'Svenska'],
  ['Norwegian', 'Norsk'],
  ['Danish', 'Dansk'],
  ['Finnish', 'Suomi'],
  ['Chinese (Simplified)', '简体中文'],
  ['Chinese (Traditional)', '繁體中文'],
  ['Japanese', '日本語'],
  ['Hindi', 'हिन्दी'],
  ['Bengali', 'বাংলা'],
  ['Thai', 'ไทย'],
  ['Vietnamese', 'Tiếng Việt'],
  ['Indonesian', 'Bahasa Indonesia'],
  ['Hebrew', 'עברית'],
  ['Bulgarian', 'Български'],
  ['Croatian', 'Hrvatski'],
  ['Kannada', 'ಕನ್ನಡ'],
  ['Lithuanian', 'Lietuvių'],
  ['Marathi', 'मराठी'],
  ['Slovak', 'Slovenčina'],
  ['Slovenian', 'Slovenščina'],
  ['Tamil', 'தமிழ்'],
  ['Telugu', 'తెలుగు'],
];

export const BROWSER_LANGUAGE_CODES = new Map([
  ['english', 'en'], ['en', 'en'],
  ['arabic', 'ar'], ['العربية', 'ar'], ['ar', 'ar'],
  ['bulgarian', 'bg'], ['български', 'bg'], ['bg', 'bg'],
  ['bengali', 'bn'], ['বাংলা', 'bn'], ['bn', 'bn'],
  ['czech', 'cs'], ['čeština', 'cs'], ['cs', 'cs'],
  ['danish', 'da'], ['dansk', 'da'], ['da', 'da'],
  ['german', 'de'], ['deutsch', 'de'], ['de', 'de'],
  ['greek', 'el'], ['ελληνικά', 'el'], ['el', 'el'],
  ['spanish', 'es'], ['español', 'es'], ['espanol', 'es'], ['es', 'es'],
  ['finnish', 'fi'], ['suomi', 'fi'], ['fi', 'fi'],
  ['french', 'fr'], ['français', 'fr'], ['francais', 'fr'], ['fr', 'fr'],
  ['hebrew', 'he'], ['עברית', 'he'], ['he', 'he'],
  ['hindi', 'hi'], ['हिन्दी', 'hi'], ['हिंदी', 'hi'], ['hi', 'hi'],
  ['croatian', 'hr'], ['hrvatski', 'hr'], ['hr', 'hr'],
  ['hungarian', 'hu'], ['magyar', 'hu'], ['hu', 'hu'],
  ['indonesian', 'id'], ['bahasa indonesia', 'id'], ['id', 'id'],
  ['italian', 'it'], ['italiano', 'it'], ['it', 'it'],
  ['japanese', 'ja'], ['日本語', 'ja'], ['ja', 'ja'],
  ['kannada', 'kn'], ['ಕನ್ನಡ', 'kn'], ['kn', 'kn'],
  ['korean', 'ko'], ['한국어', 'ko'], ['ko', 'ko'],
  ['lithuanian', 'lt'], ['lietuvių', 'lt'], ['lt', 'lt'],
  ['marathi', 'mr'], ['मराठी', 'mr'], ['mr', 'mr'],
  ['dutch', 'nl'], ['nederlands', 'nl'], ['nl', 'nl'],
  ['norwegian', 'no'], ['norsk', 'no'], ['no', 'no'], ['nb', 'no'],
  ['polish', 'pl'], ['polski', 'pl'], ['pl', 'pl'],
  ['portuguese', 'pt'], ['português', 'pt'], ['portugues', 'pt'], ['pt', 'pt'],
  ['romanian', 'ro'], ['română', 'ro'], ['romana', 'ro'], ['ro', 'ro'],
  ['russian', 'ru'], ['русский', 'ru'], ['ru', 'ru'],
  ['slovak', 'sk'], ['slovenčina', 'sk'], ['sk', 'sk'],
  ['slovenian', 'sl'], ['slovenščina', 'sl'], ['sl', 'sl'],
  ['swedish', 'sv'], ['svenska', 'sv'], ['sv', 'sv'],
  ['tamil', 'ta'], ['தமிழ்', 'ta'], ['ta', 'ta'],
  ['telugu', 'te'], ['తెలుగు', 'te'], ['te', 'te'],
  ['thai', 'th'], ['ไทย', 'th'], ['th', 'th'],
  ['turkish', 'tr'], ['türkçe', 'tr'], ['turkce', 'tr'], ['tr', 'tr'],
  ['ukrainian', 'uk'], ['українська', 'uk'], ['uk', 'uk'],
  ['vietnamese', 'vi'], ['tiếng việt', 'vi'], ['tieng viet', 'vi'], ['vi', 'vi'],
  ['chinese', 'zh'], ['chinese simplified', 'zh'], ['chinese (simplified)', 'zh'], ['简体中文', 'zh'], ['zh', 'zh'],
  ['chinese traditional', 'zh-Hant'], ['chinese (traditional)', 'zh-Hant'], ['繁體中文', 'zh-Hant'], ['zh-hant', 'zh-Hant'],
]);

export const RTL_LANGUAGE_RE = /\b(arabic|hebrew|persian|farsi|urdu|pashto|sorani|kurdish|yiddish|uyghur)\b/i;

export function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeLanguage(value) {
  return normalize(value).toLocaleLowerCase('en-US').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function resolveBrowserLanguageCode(value) {
  const raw = normalize(value);
  const exact = BROWSER_LANGUAGE_CODES.get(raw.toLocaleLowerCase('en-US'));
  if (exact) return exact;
  return BROWSER_LANGUAGE_CODES.get(normalizeLanguage(value)) || null;
}

export function isEnglish(language) {
  return /^english(?:\s*\(.*\))?$/i.test(normalize(language)) || normalizeLanguage(language) === 'en';
}


/** Languages offered as one-tap choices in the switcher (all are in SUGGESTED_LANGUAGES). */
export const QUICK_LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Turkish', 'Arabic', 'Korean', 'Chinese (Simplified)'];

/**
 * Short code shown on the header button: "EN", "ES", "ZH-HANT"... Falls back to
 * the first two letters of whatever the player typed, uppercased.
 */
export function languageShortCode(language) {
  if (isEnglish(language)) return 'EN';
  const code = resolveBrowserLanguageCode(language);
  if (code) return code.toUpperCase();
  const letters = normalize(language).replace(/[^\p{L}]/gu, '');
  return letters ? letters.slice(0, 2).toUpperCase() : 'EN';
}
