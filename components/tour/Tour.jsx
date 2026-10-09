'use client';

import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageProvider';
import {
  availableSteps, hasPendingLater, reanchor, tourTone,
} from '../../lib/tours/tours.mjs';
import {
  isSheet, placePopover, reservedBottom, scrollDelta, spotRect,
} from '../../lib/tours/geometry.mjs';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FORM_CONTROL = 'input, select, textarea, [contenteditable="true"]';
const WAIT_MS = 4000; // how long a tour waits for its first anchor before giving up quietly

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function findAnchor(name) {
  const nodes = document.querySelectorAll(`[data-tour~="${name}"]`);
  for (const node of nodes) if (isVisible(node)) return node;
  return null;
}

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function sameRect(a, b) {
  if (!a || !b) return a === b;
  return a.id === b.id && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

function topInset() {
  const header = document.querySelector('.site-header');
  if (!header) return 0;
  const rect = header.getBoundingClientRect();
  return Math.max(0, rect.bottom);
}

function bottomInset() {
  const bars = Array.from(document.querySelectorAll('[data-tour-reserve]'))
    .filter(isVisible)
    .map((el) => el.getBoundingClientRect());
  return reservedBottom(bars, window.innerHeight);
}

// One running walkthrough. Highlights real elements (data-tour="..."), never touches form state.
export default function Tour({ tour, auto, opener, onFinish }) {
  const { t, language } = useLanguage();
  const titleId = useId();
  const bodyId = useId();
  const rootRef = useRef(null);
  const popRef = useRef(null);
  const elsRef = useRef(new Map());
  const stateRef = useRef({ ids: [], current: null });
  const restoreRef = useRef(opener || null);
  const everShown = useRef(false);
  const lastScroll = useRef({ id: null, h: 0 });
  const focusInsideRef = useRef(false);

  const [state, setState] = useState({ ids: [], current: null });
  const [rect, setRect] = useState(null);
  const [size, setSize] = useState({ width: 360, height: 220 });
  const [viewport, setViewport] = useState({ width: 1024, height: 768 });
  const [live, setLive] = useState('');
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });
  const [paused, setPaused] = useState(false);
  const currentId = state.current;
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const dir = typeof document !== 'undefined' ? (document.documentElement.dir || 'ltr') : 'ltr';
  const tone = tourTone(tour);
  const sheet = isSheet(viewport.width);

  const measure = useCallback(() => {
    // A modal dialog (language picker, admin dialogs) has the floor: the walkthrough steps aside until it closes.
    const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
    setPaused((prev) => (prev === Boolean(modal) ? prev : Boolean(modal)));
    const el = elsRef.current.get(stateRef.current.current);
    setViewport((prev) => (prev.width === window.innerWidth && prev.height === window.innerHeight ? prev : { width: window.innerWidth, height: window.innerHeight }));
    const nextInsets = { top: topInset(), bottom: bottomInset() };
    setInsets((prev) => (Math.abs(prev.top - nextInsets.top) < 1 && Math.abs(prev.bottom - nextInsets.bottom) < 1 ? prev : nextInsets));
    if (!el || !el.isConnected) { setRect((prev) => (prev === null ? prev : null)); return; }
    const r = el.getBoundingClientRect();
    const next = { id: stateRef.current.current, top: r.top, left: r.left, width: r.width, height: r.height };
    setRect((prev) => (sameRect(prev, next) ? prev : next));
  }, []);

  // Which steps can be shown right now (anchor present and visible), and which one we are on.
  const refresh = useCallback(() => {
    const els = new Map();
    const avail = availableSteps(tour, (step) => {
      const el = findAnchor(step.anchor);
      if (el) els.set(step.id, el);
      return Boolean(el);
    });
    elsRef.current = els;
    const ids = avail.map((s) => s.id);
    const prev = stateRef.current;
    const current = reanchor(tour, prev.current, avail);
    if (ids.length) everShown.current = true;
    if (current !== prev.current || ids.join() !== prev.ids.join()) {
      stateRef.current = { ids, current };
      setState({ ids, current });
    }
    measure();
  }, [tour, measure]);

  const pausedRef = useRef(false);
  const rafRef = useRef(0);
  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => { rafRef.current = 0; refresh(); });
  }, [refresh]);

  // Watch the page: wizard steps open and close, sections appear, the window resizes, the page scrolls.
  useEffect(() => {
    refresh();
    const observer = new MutationObserver((records) => {
      if (records.every((r) => rootRef.current && rootRef.current.contains(r.target))) return;
      schedule();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'data-tour', 'aria-hidden', 'open'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    const vv = window.visualViewport;
    vv?.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, { capture: true });
      vv?.removeEventListener('resize', schedule);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [refresh, schedule]);

  // Nothing to show: a manual start or an auto start gives up quietly; a wizard tour that already showed
  // something keeps waiting for the next screen.
  useEffect(() => {
    if (state.ids.length || (tour.follows && everShown.current)) return undefined;
    const timer = window.setTimeout(() => {
      if (!stateRef.current.ids.length) onFinish('cancel');
    }, auto ? WAIT_MS : 1500);
    return () => window.clearTimeout(timer);
  }, [state.ids.length, tour, auto, onFinish]);

  const index = state.current ? state.ids.indexOf(state.current) : -1;
  const step = index >= 0 ? tour.steps.find((s) => s.id === state.current) : null;
  const total = state.ids.length;
  const isLast = index === total - 1;
  const pendingMore = tour.follows && isLast && hasPendingLater(tour, state.current, state.ids.map((id) => tour.steps.find((s) => s.id === id)));
  const shown = Boolean(step);

  // Measure the popover (it grows with longer translations and Easy view).
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop) return undefined;
    const read = () => setSize((prev) => (Math.abs(prev.width - pop.offsetWidth) < 1 && Math.abs(prev.height - pop.offsetHeight) < 1 ? prev : { width: pop.offsetWidth, height: pop.offsetHeight }));
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(pop);
    return () => ro.disconnect();
  }, [shown, currentId, language]);

  // Bring the highlighted element into view, clear of the sticky header and (on phones) the bottom sheet.
  useEffect(() => {
    if (!step || !rect || rect.id !== step.id) return; // wait for the new step's own measurement
    const last = lastScroll.current;
    const sheetHeight = sheet ? size.height : 0;
    if (last.id === step.id && Math.abs(last.h - sheetHeight) < 24) return;
    lastScroll.current = { id: step.id, h: sheetHeight };
    const delta = scrollDelta({
      rect,
      viewportHeight: viewport.height,
      insets: { top: insets.top, bottom: insets.bottom + sheetHeight },
      reserved: insets.bottom,
    });
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
  }, [step, rect, sheet, size.height, viewport.height, insets.top, insets.bottom]);

  // On a phone the sheet covers the bottom of the screen: give the page that much extra room at its end so even
  // the last element can be scrolled above the sheet.
  useEffect(() => {
    const root = document.documentElement;
    if (!sheet || !shown) { root.classList.remove('k-tour-sheet-open'); return undefined; }
    root.style.setProperty('--k-tour-pad', `${Math.round(size.height + insets.bottom)}px`);
    root.classList.add('k-tour-sheet-open');
    return () => { root.classList.remove('k-tour-sheet-open'); };
  }, [sheet, shown, size.height, insets.bottom]);

  // Move focus into the popover the first time it appears (not while the visitor is typing in an auto-started tour).
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (!shown || focusedOnce.current) return;
    focusedOnce.current = true;
    const active = document.activeElement;
    if (!restoreRef.current) restoreRef.current = active;
    if (auto && active && active.matches && active.matches(FORM_CONTROL)) return;
    popRef.current?.focus({ preventScroll: true });
  }, [shown, auto]);

  // Screen readers: announce each new tip (the first one is announced by focusing the dialog).
  const announcedFirst = useRef(false);
  useEffect(() => {
    if (!step) return;
    if (!announcedFirst.current) { announcedFirst.current = true; return; }
    setLive(t('tour.ui.live', { current: index + 1, total, title: t(step.titleKey) }));
  }, [step?.id, language]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the focused Back/Next button vanished or changed, keep focus inside the walkthrough.
  useEffect(() => {
    if (!focusInsideRef.current) return;
    const pop = popRef.current;
    if (pop && !pop.contains(document.activeElement)) (pop.querySelector('[data-tour-primary]') || pop).focus({ preventScroll: true });
    focusInsideRef.current = false;
  }, [currentId]);

  const finish = useCallback((kind) => {
    const target = restoreRef.current;
    onFinish(kind);
    window.setTimeout(() => {
      if (target && target.isConnected && typeof target.focus === 'function' && target !== document.body) target.focus({ preventScroll: true });
    }, 0);
  }, [onFinish]);

  const go = useCallback((delta) => {
    const { ids, current } = stateRef.current;
    const at = ids.indexOf(current);
    const next = ids[at + delta];
    focusInsideRef.current = Boolean(popRef.current && popRef.current.contains(document.activeElement));
    if (!next) return;
    stateRef.current = { ids, current: next };
    setState({ ids, current: next });
    window.requestAnimationFrame(measure);
  }, [measure]);

  // Esc skips; Tab cycles inside the popover while focus is in it (so highlighted fields stay reachable otherwise).
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape' && !event.defaultPrevented && popRef.current && !pausedRef.current) {
        event.preventDefault();
        finish('skipped');
        return;
      }
      if (event.key !== 'Tab') return;
      const pop = popRef.current;
      if (!pop || !pop.contains(document.activeElement)) return;
      const nodes = Array.from(pop.querySelectorAll(FOCUSABLE));
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === pop)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish]);

  if (typeof document === 'undefined') return null;

  const spot = rect && shown ? spotRect(rect, viewport) : null;
  let popStyle;
  let side = 'sheet';
  if (!sheet && shown) {
    const placed = placePopover({
      rect: rect || { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 },
      size,
      viewport,
      insets,
      placement: step.placement,
      dir,
    });
    side = placed.side;
    popStyle = { top: `${Math.round(placed.top)}px`, left: `${Math.round(placed.left)}px` };
  } else if (sheet) {
    popStyle = { bottom: `${Math.round(insets.bottom)}px` };
  }

  return createPortal(
    <div ref={rootRef} className={`k-tour k-tour--${tone}${paused ? ' k-tour--paused' : ''}`} data-tour-root>
      {spot ? (
        <div
          className="k-tour-spot"
          aria-hidden="true"
          style={{ width: `${spot.width}px`, height: `${spot.height}px`, transform: `translate(${spot.left}px, ${spot.top}px)` }}
        />
      ) : null}
      {shown ? (
        <div
          ref={popRef}
          role="dialog"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
          className={`k-tour-pop${sheet ? ' k-tour-pop--sheet' : ''}`}
          data-side={side}
          style={popStyle}
        >
          <p className="k-tour-count">{t('tour.ui.stepOf', { current: index + 1, total })}</p>
          <h2 className="k-tour-title" id={titleId}>{t(step.titleKey)}</h2>
          <p className="k-tour-body" id={bodyId}>{t(step.bodyKey)}</p>
          {pendingMore ? <p className="k-tour-more">{t('tour.ui.more')}</p> : null}
          <div className="k-tour-actions">
            <button type="button" className="k-tour-btn k-tour-btn--text" onClick={() => finish('skipped')}>{t('tour.ui.skip')}</button>
            <span className="k-tour-actions-main">
              {index > 0 ? <button type="button" className="k-tour-btn k-tour-btn--quiet" onClick={() => go(-1)}>{t('tour.ui.back')}</button> : null}
              <button
                type="button"
                className="k-tour-btn k-tour-btn--primary"
                data-tour-primary
                onClick={() => (isLast ? finish('completed') : go(1))}
              >
                {isLast ? t('tour.ui.done') : t('tour.ui.next')}
              </button>
            </span>
          </div>
          <p className="k-tour-esc">{t('tour.ui.esc')}</p>
        </div>
      ) : null}
      <div className="k-tour-live" aria-live="polite" role="status">{live}</div>
    </div>,
    document.body,
  );
}
