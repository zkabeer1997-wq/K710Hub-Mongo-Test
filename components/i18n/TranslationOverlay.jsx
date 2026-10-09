'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import glossary from '../../i18n/glossary.json';
import { buildMatcher, glossaryTerms } from '../../lib/i18n/catalogTools.mjs';
import {
  ATTRIBUTES, applyUnit, collectUnits, createState, markBadBlock, prune, restoreAll,
} from '../../lib/i18n/domUnits';
import { RUNTIME_LIMITS, clientKey, isTranslatableText } from '../../lib/i18n/units.mjs';

// Universal runtime translation: when the language is not English, every visible string that the
// catalog (i18n/locales) did not already translate is sent to /api/translate in batches and written
// back into the page. English shows instantly; translations swap in as they arrive. Text nodes and
// attributes are edited in place (never replaced), so React keeps working, and English is restored
// exactly when the visitor switches back. See docs/translation.md.

const CACHE_PREFIX = 'k710-rt-v1:';
const CACHE_MAX_ENTRIES = 4000;
const SLOW_MS = 1000;
const DEBOUNCE_MS = 140;
const glossaryRe = buildMatcher(glossaryTerms(glossary));

function readCache(engine, lang) {
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${engine}:${lang}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return new Map(Object.entries(parsed && typeof parsed === 'object' ? parsed : {}));
  } catch {
    return new Map();
  }
}

function writeCache(engine, lang, map) {
  try {
    const entries = [...map.entries()].slice(-CACHE_MAX_ENTRIES);
    window.localStorage.setItem(`${CACHE_PREFIX}${engine}:${lang}`, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* private mode or quota: translations still work, they just are not remembered */ }
}

const INLINE = new Set(['A', 'SPAN', 'B', 'STRONG', 'EM', 'I', 'U', 'SMALL', 'MARK', 'SUB', 'SUP', 'ABBR', 'TIME', 'CITE', 'DFN', 'Q', 'S', 'DEL', 'INS', 'BDI', 'BDO']);
/** Re-scan the whole sentence, not just the inline element that changed. */
function blockRoot(node) {
  let el = node.nodeType === 1 ? node : node.parentElement;
  while (el && el.parentElement && INLINE.has(el.tagName) && el.parentElement !== document.body) el = el.parentElement;
  return el;
}

/** Catalog text already in the page must not be sent again: exact values and {placeholder} templates. */
function buildCatalogMatcher(messages) {
  const exact = new Set();
  const patterns = [];
  for (const value of Object.values(messages || {})) {
    if (typeof value !== 'string') continue;
    if (/\{[a-zA-Z0-9_]+\}/.test(value)) {
      const source = value.normalize('NFC').replace(/\s+/g, ' ').trim().split(/\{[a-zA-Z0-9_]+\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?');
      try { patterns.push(new RegExp(`^${source}$`, 'u')); } catch { /* skip an unparseable template */ }
    } else exact.add(value.normalize('NFC').replace(/\s+/g, ' ').trim());
  }
  return (text) => {
    const plain = String(text).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return exact.has(plain) || patterns.some((re) => re.test(plain));
  };
}

export default function TranslationOverlay({ lang, messages, engine = 'google', t }) {
  const pathname = usePathname();
  const disabled = lang === 'en' || /^\/admin(\/|$)/.test(pathname || '');
  const [status, setStatus] = useState('idle'); // idle | translating
  const [notice, setNotice] = useState(false);
  const stateRef = useRef(createState());
  const firstRun = useRef(true);
  const isCatalogText = useMemo(() => buildCatalogMatcher(messages), [messages]);
  const live = useRef({ lang, isCatalogText });
  useEffect(() => { live.current = { lang, isCatalogText }; }, [lang, isCatalogText]);

  // Debug / tooling hook: the pre-warm crawler and the coverage test read the page's units from here.
  useEffect(() => {
    window.__k710i18n = {
      collect: (forLang = null) => collectUnits(document.body, { state: stateRef.current, glossaryRe, lang: forLang, isCatalogText: forLang ? live.current.isCatalogText : null })
        .map((u) => ({ key: u.key, kind: u.kind, attr: u.attr || null, tag: u.el?.tagName || null })),
      busy: () => window.__k710i18nBusy === true,
      stats: () => ({ nodes: stateRef.current.nodes.size, attrs: [...stateRef.current.attrs.values()].reduce((n, m) => n + m.size, 0) }),
      isApplied: (node) => { const t = stateRef.current.nodes.get(node); return Boolean(t && node.data === t.applied); },
      isApplied_attr: (el, attr) => { const t = stateRef.current.attrs.get(el)?.get(attr); return Boolean(t && el.getAttribute(attr) === t.applied); },
      isTranslatable: (text) => isTranslatableText(text, { glossaryRe }),
    };
    return () => { delete window.__k710i18n; };
  }, []);

  useEffect(() => {
    if (disabled) return undefined;
    const state = stateRef.current;
    let active = true;
    let observer = null;
    let timer = 0;
    let slowTimer = 0;
    let inFlight = 0;
    let dirty = new Set();
    let applying = false;
    let saveTimer = 0;
    const memory = readCache(engine, lang);
    const failed = new Set(); // keys the server could not translate this session: never asked again
    const asked = new Set();  // keys with a request in flight
    const queue = [];
    let pumping = false;

    const setBusy = () => { window.__k710i18nBusy = inFlight > 0 || queue.length > 0 || dirty.size > 0 || timer !== 0; };

    const apply = (fn) => {
      applying = true;
      try { fn(); } finally {
        observer?.takeRecords();
        applying = false;
      }
    };

    const saveSoon = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => writeCache(engine, lang, memory), 800);
    };

    function scan(root) {
      if (!active || !root || !root.isConnected) return;
      const units = collectUnits(root, { state, glossaryRe, lang, isCatalogText: live.current.isCatalogText });
      let needsRescan = false;
      const wantKeys = [];
      apply(() => {
        for (const unit of units) {
          const hit = memory.get(clientKey(lang, unit.key));
          if (hit !== undefined) {
            if (!applyUnit(unit, hit, state) && markBadBlock(unit, state)) needsRescan = true;
          } else if (!failed.has(unit.key) && !asked.has(unit.key) && !wantKeys.includes(unit.key)) wantKeys.push(unit.key);
        }
      });
      if (wantKeys.length) {
        for (const key of wantKeys) { asked.add(key); queue.push(key); }
        pump();
      }
      if (needsRescan) { dirty.add(root); schedule(); }
    }

    // Rate limited (too many requests from this address): try the same strings again in a little while.
    const attempts = new Map();
    function retryLater(keys) {
      const again = keys.filter((key) => (attempts.get(key) || 0) < 3);
      again.forEach((key) => attempts.set(key, (attempts.get(key) || 0) + 1));
      keys.filter((key) => !again.includes(key)).forEach((key) => failed.add(key));
      if (!again.length) return;
      window.setTimeout(() => { if (!active) return; again.forEach((key) => { asked.add(key); queue.push(key); }); pump(); }, 15000);
    }

    function startSlowTimer() {
      if (slowTimer) return;
      slowTimer = window.setTimeout(() => { slowTimer = 0; if (inFlight > 0) setStatus('translating'); }, SLOW_MS);
    }

    async function sendBatch(keys) {
      inFlight += 1;
      setBusy();
      startSlowTimer();
      let ok = false;
      try {
        const controller = new AbortController();
        const abort = window.setTimeout(() => controller.abort(), 25000);
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ lang, strings: keys }),
          signal: controller.signal,
        });
        window.clearTimeout(abort);
        if (response.status === 429) { retryLater(keys); ok = true; }
        const data = response.ok ? await response.json() : null;
        if (data && Array.isArray(data.translations)) {
          let got = 0;
          keys.forEach((key, i) => {
            const value = data.translations[i];
            if (typeof value === 'string' && value) { memory.set(clientKey(lang, key), value); got += 1; } else failed.add(key);
          });
          ok = data.status !== 'unavailable' && data.status !== 'budget';
          if (got) saveSoon();
        } else if (response.status !== 429) keys.forEach((key) => failed.add(key));
      } catch {
        keys.forEach((key) => failed.add(key));
      } finally {
        inFlight -= 1;
        keys.forEach((key) => asked.delete(key));
      }
      if (!ok) setNotice(true);
      if (active) {
        scan(document.body);
        if (inFlight === 0 && queue.length === 0) { window.clearTimeout(slowTimer); slowTimer = 0; setStatus('idle'); }
      }
      setBusy();
    }

    function pump() {
      if (pumping) return;
      pumping = true;
      queueMicrotask(() => {
        pumping = false;
        while (active && queue.length && inFlight < 2) {
          const keys = [];
          let chars = 0;
          while (queue.length && keys.length < RUNTIME_LIMITS.clientBatchStrings && chars + queue[0].length <= RUNTIME_LIMITS.clientBatchChars) {
            const key = queue.shift();
            keys.push(key);
            chars += key.length;
          }
          if (!keys.length) { failed.add(queue.shift()); continue; }
          sendBatch(keys).then(() => { if (queue.length) pump(); });
        }
        setBusy();
      });
    }

    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = 0;
        const roots = [...dirty];
        dirty = new Set();
        const top = roots.filter((r) => r.isConnected && !roots.some((o) => o !== r && o.contains(r)));
        for (const root of top) scan(root);
        prune(state);
        setBusy();
      }, DEBOUNCE_MS);
      setBusy();
    }

    function onMutations(records) {
      if (applying) return;
      for (const record of records) {
        if (record.type === 'childList') {
          record.addedNodes.forEach((node) => {
            if (node.nodeType === 1 || (node.nodeType === 3 && node.data.trim())) { const root = blockRoot(node); if (root) dirty.add(root); }
          });
        } else if (record.type === 'characterData') {
          const root = blockRoot(record.target);
          if (root) dirty.add(root);
        } else if (record.type === 'attributes') {
          dirty.add(record.target);
        }
      }
      if (dirty.size) schedule();
    }

    async function start() {
      // Never touch the page before React finished hydrating it: a swapped text node would be a hydration mismatch.
      if (document.readyState !== 'complete') await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
      await new Promise((resolve) => ('requestIdleCallback' in window ? window.requestIdleCallback(resolve, { timeout: 1200 }) : window.setTimeout(resolve, 200)));
      if (firstRun.current) await new Promise((resolve) => window.setTimeout(resolve, 350));
      firstRun.current = false;
      if (!active) return;
      observer = new MutationObserver(onMutations);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
      const title = document.querySelector('title');
      if (title) observer.observe(title, { childList: true, characterData: true, subtree: true });
      if (title) scan(title);
      scan(document.body);
    }
    start();

    return () => {
      active = false;
      observer?.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(slowTimer);
      window.clearTimeout(saveTimer);
      writeCache(engine, lang, memory);
      queue.length = 0;
      restoreAll(state); // back to English (the next language, or English itself, takes over from here)
      setStatus('idle');
      window.__k710i18nBusy = false;
    };
  }, [disabled, lang, engine]);

  useEffect(() => { if (disabled) setNotice(false); }, [disabled]);

  if (disabled) return null;
  return (
    <div className="rt-status-wrap">
      {status === 'translating' && !notice && (
        <p className="rt-status" role="status" aria-live="polite">{t('translate.working')}</p>
      )}
      {notice && (
        <p className="rt-status rt-status-warn" role="status" aria-live="polite">
          <span>{t('translate.unavailable')}</span>
          <button type="button" className="rt-status-close" onClick={() => setNotice(false)} aria-label={t('translate.dismiss')}>×</button>
        </p>
      )}
    </div>
  );
}
