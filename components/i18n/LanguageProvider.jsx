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

// Chrome's stable on-device Translator API currently supports these language
// families. These cover the principal K710 languages without any cloud API.
const SUGGESTED_LANGUAGES = [
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

const BROWSER_LANGUAGE_CODES = new Map([
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

const RTL_LANGUAGE_RE = /\b(arabic|hebrew|persian|farsi|urdu|pashto|sorani|kurdish|yiddish|uyghur)\b/i;
const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE']);

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLanguage(value) {
  return normalize(value).toLocaleLowerCase('en-US').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveBrowserLanguageCode(value) {
  const raw = normalize(value);
  const exact = BROWSER_LANGUAGE_CODES.get(raw.toLocaleLowerCase('en-US'));
  if (exact) return exact;
  return BROWSER_LANGUAGE_CODES.get(normalizeLanguage(value)) || null;
}

function preserveWhitespace(raw, translated) {
  const prefix = raw.match(/^\s*/)?.[0] || '';
  const suffix = raw.match(/\s*$/)?.[0] || '';
  return `${prefix}${translated}${suffix}`;
}

function isEnglish(language) {
  return /^english(?:\s*\(.*\))?$/i.test(normalize(language)) || normalizeLanguage(language) === 'en';
}

function shouldSkipElement(element) {
  if (!element) return true;
  if (BLOCKED_TAGS.has(element.tagName)) return true;
  return Boolean(element.closest?.('[data-k710-no-translate], .notranslate, [translate="no"]'));
}

function readCache(language) {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${language}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function writeCache(language, cache) {
  try {
    const entries = [...cache.entries()].slice(-2200);
    localStorage.setItem(`${CACHE_PREFIX}${language}`, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage limits/private browsing are non-fatal.
  }
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export default function LanguageProvider({ children }) {
  const pathname = usePathname();
  const [language, setLanguage] = useState('English');
  const [hasChosenLanguage, setHasChosenLanguage] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [inputLanguage, setInputLanguage] = useState('English');
  const [manifest, setManifest] = useState(null);
  const [translationStatus, setTranslationStatus] = useState('idle');
  const [languageError, setLanguageError] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(null);

  const languageRef = useRef('English');
  const cacheRef = useRef(new Map());
  const originalTextRef = useRef(new WeakMap());
  const originalAttrRef = useRef(new WeakMap());
  const trackedTextNodesRef = useRef(new Set());
  const trackedElementsRef = useRef(new Set());
  const observerRef = useRef(null);
  const scheduleRef = useRef(null);
  const processingRef = useRef(false);
  const queuedRef = useRef(false);
  const failureUntilRef = useRef(0);
  const browserTranslatorRef = useRef(null);
  const browserTranslatorPromiseRef = useRef(null);

  const destroyBrowserTranslator = useCallback(() => {
    try {
      browserTranslatorRef.current?.translator?.destroy?.();
    } catch {
      // Best-effort cleanup.
    }
    browserTranslatorRef.current = null;
    browserTranslatorPromiseRef.current = null;
  }, []);

  const startBrowserTranslator = useCallback((targetLanguage) => {
    if (typeof window === 'undefined' || !('Translator' in window)) return null;
    const targetCode = resolveBrowserLanguageCode(targetLanguage);
    if (!targetCode || targetCode === 'en') return null;

    const current = browserTranslatorRef.current;
    if (current?.language === targetLanguage && current?.translator) {
      return Promise.resolve(current.translator);
    }

    const pending = browserTranslatorPromiseRef.current;
    if (pending?.language === targetLanguage && pending?.promise) return pending.promise;

    destroyBrowserTranslator();
    setDownloadProgress(null);
    setTranslationStatus('translating');

    // create() is intentionally called directly from the user's language-selection
    // click whenever possible because Chrome requires user activation when a language
    // pack needs to be created/downloaded.
    const promise = window.Translator.create({
      sourceLanguage: 'en',
      targetLanguage: targetCode,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          const value = Math.max(0, Math.min(100, Math.round((event.loaded || 0) * 100)));
          setDownloadProgress(value);
        });
      },
    })
      .then((translator) => {
        browserTranslatorRef.current = { language: targetLanguage, translator };
        setDownloadProgress(100);
        return translator;
      })
      .catch((error) => {
        console.warn('K710 browser Translator API unavailable', error);
        browserTranslatorPromiseRef.current = null;
        return null;
      });

    browserTranslatorPromiseRef.current = { language: targetLanguage, promise };
    return promise;
  }, [destroyBrowserTranslator]);

  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }

    if (saved) {
      setLanguage(saved);
      setInputLanguage(saved);
      languageRef.current = saved;
      cacheRef.current = readCache(saved);
      setHasChosenLanguage(true);

      // A previously downloaded Chrome language pack may be reusable without a
      // visible download. Try it; if Chrome requires fresh user activation, the
      // server fallback remains available and the globe control can re-arm it.
      if (!isEnglish(saved)) {
        try {
          startBrowserTranslator(saved);
        } catch {
          // Non-fatal; requestTranslations will use the server fallback.
        }
      }
    } else {
      setChooserOpen(true);
      setHasChosenLanguage(false);
    }
  }, [startBrowserTranslator]);

  useEffect(() => {
    let active = true;
    fetch('/ui-strings.json', { cache: 'force-cache' })
      .then((response) => (response.ok ? response.json() : []))
      .then((values) => {
        if (!active) return;
        setManifest(new Set(Array.isArray(values) ? values.map(normalize) : []));
      })
      .catch(() => {
        if (active) setManifest(new Set());
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => destroyBrowserTranslator(), [destroyBrowserTranslator]);

  const restoreTracked = useCallback(() => {
    for (const node of [...trackedTextNodesRef.current]) {
      if (!node.isConnected) {
        trackedTextNodesRef.current.delete(node);
        continue;
      }
      const original = originalTextRef.current.get(node);
      if (original && node.nodeValue !== original.raw) node.nodeValue = original.raw;
    }

    for (const element of [...trackedElementsRef.current]) {
      if (!element.isConnected) {
        trackedElementsRef.current.delete(element);
        continue;
      }
      const attrs = originalAttrRef.current.get(element);
      if (!attrs) continue;
      for (const [name, original] of attrs.entries()) {
        if (element.hasAttribute(name) && element.getAttribute(name) !== original) {
          element.setAttribute(name, original);
        }
      }
    }
  }, []);

  const requestServerTranslations = useCallback(async (items, targetLanguage) => {
    const results = new Map();
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const response = await fetch('/api/translate-ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: targetLanguage, strings: batch }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data?.error || `Translation failed (${response.status})`);
        error.code = data?.code || 'TRANSLATION_FAILED';
        error.retryAfter = Number(data?.retryAfter || response.headers.get('Retry-After') || 60);
        throw error;
      }

      if (!Array.isArray(data?.translated) || data.translated.length !== batch.length) {
        const error = new Error('Translation response shape mismatch');
        error.code = 'BAD_TRANSLATION_RESPONSE';
        error.retryAfter = 60;
        throw error;
      }
      batch.forEach((source, index) => results.set(source, data.translated[index]));
    }
    return results;
  }, []);

  const requestTranslations = useCallback(async (items, targetLanguage) => {
    // Fast/default path on supported desktop Chrome: translation stays entirely
    // on-device and does not require Vercel billing or a third-party API.
    const browserCode = resolveBrowserLanguageCode(targetLanguage);
    if (browserCode && typeof window !== 'undefined' && 'Translator' in window) {
      let translator = browserTranslatorRef.current?.language === targetLanguage
        ? browserTranslatorRef.current.translator
        : null;

      if (!translator) {
        const pending = browserTranslatorPromiseRef.current;
        if (pending?.language === targetLanguage) translator = await pending.promise;
      }

      if (!translator) translator = await startBrowserTranslator(targetLanguage);

      if (translator) {
        const values = await Promise.all(items.map((source) => translator.translate(source)));
        const results = new Map();
        items.forEach((source, index) => results.set(source, values[index]));
        return results;
      }
    }

    return requestServerTranslations(items, targetLanguage);
  }, [requestServerTranslations, startBrowserTranslator]);

  const processDocument = useCallback(async () => {
    if (Date.now() < failureUntilRef.current) return;
    if (!manifest || processingRef.current || typeof document === 'undefined') {
      queuedRef.current = true;
      return;
    }

    processingRef.current = true;
    queuedRef.current = false;
    const targetLanguage = languageRef.current;

    try {
      if (isEnglish(targetLanguage)) {
        restoreTracked();
        document.documentElement.lang = 'en';
        document.documentElement.dir = 'ltr';
        setTranslationStatus('idle');
        setLanguageError('');
        return;
      }

      const browserCode = resolveBrowserLanguageCode(targetLanguage);
      document.documentElement.lang = browserCode || 'und';
      document.documentElement.dir = RTL_LANGUAGE_RE.test(targetLanguage) ? 'rtl' : 'ltr';

      const needed = new Set();
      const textTargets = [];
      const attrTargets = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();

      while (node) {
        const parent = node.parentElement;
        if (!shouldSkipElement(parent)) {
          let original = originalTextRef.current.get(node);
          if (!original) {
            const normalized = normalize(node.nodeValue);
            if (normalized && manifest.has(normalized)) {
              original = { raw: node.nodeValue, normalized };
              originalTextRef.current.set(node, original);
              trackedTextNodesRef.current.add(node);
            }
          }

          if (original) {
            textTargets.push([node, original]);
            if (!cacheRef.current.has(original.normalized)) needed.add(original.normalized);
          }
        }
        node = walker.nextNode();
      }

      const elements = document.body.querySelectorAll('[placeholder], [title], [aria-label]');
      for (const element of elements) {
        if (shouldSkipElement(element)) continue;
        let originals = originalAttrRef.current.get(element);
        if (!originals) {
          originals = new Map();
          originalAttrRef.current.set(element, originals);
        }

        for (const name of ['placeholder', 'title', 'aria-label']) {
          if (!element.hasAttribute(name)) continue;
          if (!originals.has(name)) {
            const raw = element.getAttribute(name);
            const normalized = normalize(raw);
            if (normalized && manifest.has(normalized)) originals.set(name, raw);
          }
          const raw = originals.get(name);
          if (!raw) continue;
          const normalized = normalize(raw);
          attrTargets.push([element, name, raw, normalized]);
          trackedElementsRef.current.add(element);
          if (!cacheRef.current.has(normalized)) needed.add(normalized);
        }
      }

      if (needed.size) {
        setTranslationStatus('translating');
        setLanguageError('');
        const translated = await requestTranslations([...needed], targetLanguage);
        if (languageRef.current !== targetLanguage) return;
        for (const [source, value] of translated.entries()) cacheRef.current.set(source, value);
        writeCache(targetLanguage, cacheRef.current);
      }

      if (languageRef.current !== targetLanguage) return;

      for (const [textNode, original] of textTargets) {
        if (!textNode.isConnected) continue;
        const translated = cacheRef.current.get(original.normalized);
        if (!translated) continue;
        const nextValue = preserveWhitespace(original.raw, translated);
        if (textNode.nodeValue !== nextValue) textNode.nodeValue = nextValue;
      }

      for (const [element, name, raw, normalized] of attrTargets) {
        if (!element.isConnected) continue;
        const translated = cacheRef.current.get(normalized);
        if (!translated) continue;
        const nextValue = translated || raw;
        if (element.getAttribute(name) !== nextValue) element.setAttribute(name, nextValue);
      }

      failureUntilRef.current = 0;
      setTranslationStatus('ready');
      setDownloadProgress(null);
      setLanguageError('');
    } catch (error) {
      console.error('K710 UI translation failed', error);
      restoreTracked();
      setTranslationStatus('error');

      if (error?.code === 'UNSUPPORTED_LANGUAGE') {
        failureUntilRef.current = Number.MAX_SAFE_INTEGER;
        setLanguageError(error.message || 'That language is not supported by this browser or the fallback engine.');
        setChooserOpen(true);
      } else {
        const retryAfter = Math.max(30, Math.min(Number(error?.retryAfter || 60), 300));
        failureUntilRef.current = Date.now() + retryAfter * 1000;
        setLanguageError('Translation could not start in this browser. Choose another language or click the globe to retry.');
      }
    } finally {
      processingRef.current = false;
      if (queuedRef.current && Date.now() >= failureUntilRef.current) {
        queuedRef.current = false;
        window.setTimeout(() => processDocument(), 120);
      } else {
        queuedRef.current = false;
      }
    }
  }, [manifest, requestTranslations, restoreTracked]);

  const scheduleTranslation = useCallback(() => {
    if (typeof window === 'undefined' || Date.now() < failureUntilRef.current) return;
    if (scheduleRef.current) window.clearTimeout(scheduleRef.current);
    scheduleRef.current = window.setTimeout(() => processDocument(), 140);
  }, [processDocument]);

  useEffect(() => {
    if (!manifest || !hasChosenLanguage) return undefined;

    scheduleTranslation();
    observerRef.current?.disconnect();
    observerRef.current = new MutationObserver((mutations) => {
      if (Date.now() < failureUntilRef.current) return;
      const relevant = mutations.some((mutation) => {
        const target = mutation.target?.nodeType === Node.TEXT_NODE
          ? mutation.target.parentElement
          : mutation.target;
        return !shouldSkipElement(target);
      });
      if (relevant) scheduleTranslation();
    });
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });

    return () => {
      observerRef.current?.disconnect();
      if (scheduleRef.current) window.clearTimeout(scheduleRef.current);
    };
  }, [manifest, hasChosenLanguage, pathname, scheduleTranslation]);

  useEffect(() => {
    if (!manifest || !hasChosenLanguage) return;
    window.setTimeout(() => scheduleTranslation(), 80);
  }, [pathname, manifest, hasChosenLanguage, scheduleTranslation]);

  const applyLanguage = useCallback(
    (nextLanguage) => {
      const clean = normalize(nextLanguage) || 'English';
      restoreTracked();
      failureUntilRef.current = 0;
      setTranslationStatus('idle');
      setLanguageError('');
      setDownloadProgress(null);

      // Start Chrome's translator while this click still carries user activation.
      if (!isEnglish(clean)) {
        try {
          startBrowserTranslator(clean);
        } catch (error) {
          console.warn('K710 could not pre-arm browser translator', error);
        }
      } else {
        destroyBrowserTranslator();
      }

      setLanguage(clean);
      setInputLanguage(clean);
      languageRef.current = clean;
      cacheRef.current = readCache(clean);
      setHasChosenLanguage(true);
      setChooserOpen(false);
      try {
        localStorage.setItem(STORAGE_KEY, clean);
      } catch {
        // Non-fatal.
      }
      window.setTimeout(() => scheduleTranslation(), 0);
    },
    [destroyBrowserTranslator, restoreTracked, scheduleTranslation, startBrowserTranslator],
  );

  const openLanguageChooser = useCallback(() => {
    setInputLanguage(languageRef.current || 'English');
    setLanguageError('');
    failureUntilRef.current = 0;
    setChooserOpen(true);
  }, []);

  const contextValue = useMemo(
    () => ({ language, hasChosenLanguage, openLanguageChooser }),
    [language, hasChosenLanguage, openLanguageChooser],
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}

      {chooserOpen && (
        <div className="k710-language-overlay" data-k710-no-translate role="dialog" aria-modal="true" aria-labelledby="k710-language-title">
          <div className="k710-language-panel">
            <div className="k710-language-crest" aria-hidden="true">710</div>
            <p className="k710-language-eyebrow">KINGDOM 710</p>
            <h1 id="k710-language-title">Choose your language</h1>
            <p className="k710-language-multilingual">
              اختر لغتك · Choisissez votre langue · Dilinizi seçin · 언어 선택 · Elige tu idioma
            </p>
            <p className="k710-language-copy">
              On supported desktop browsers, translation runs on your device. Your player-entered information is not sent for translation.
            </p>

            <label className="k710-language-label" htmlFor="k710-language-input">Language</label>
            <input
              id="k710-language-input"
              className="k710-language-input"
              list="k710-language-options"
              value={inputLanguage}
              onChange={(event) => setInputLanguage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyLanguage(inputLanguage);
              }}
              placeholder="Search or type a language"
              autoComplete="off"
              autoFocus
            />
            <datalist id="k710-language-options">
              {SUGGESTED_LANGUAGES.map(([name, native]) => (
                <option key={name} value={name}>{native}</option>
              ))}
            </datalist>

            {languageError && (
              <p className="k710-language-error" role="alert">{languageError}</p>
            )}

            <button type="button" className="k710-language-enter" onClick={() => applyLanguage(inputLanguage)}>
              Enter the Kingdom
            </button>
            <p className="k710-language-footnote">Chrome 138+ desktop supports 38 on-device translation languages.</p>
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
          title={languageError || 'Change language'}
        >
          <span aria-hidden="true">🌐</span>
          <span>{language}</span>
          {translationStatus === 'translating' && (
            <>
              <span className="k710-language-spinner" aria-hidden="true" />
              {Number.isFinite(downloadProgress) && downloadProgress < 100 && (
                <span className="k710-language-progress">{downloadProgress}%</span>
              )}
            </>
          )}
          {translationStatus === 'error' && <span aria-hidden="true">!</span>}
        </button>
      )}
    </LanguageContext.Provider>
  );
}
