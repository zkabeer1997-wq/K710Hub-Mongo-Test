'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../i18n/LanguageProvider';
import { decodeImageFile } from '../../lib/scan/browser/decodeImage.mjs';
import { crop, resizeTo } from '../../lib/scan/normalize.mjs';
import {
  CATEGORY_IDS, backpackCorrections, backpackSnapshot, buildBackpackReview, categoryLabel, denominationLabel, evaluateBackpack, fillValueFor,
} from '../../lib/scan/backpackReview.mjs';
import { SPEEDUP_DENOMINATIONS } from '../../lib/scan/kinds/backpackInventory/gameData.mjs';
import { displayDays } from '../../lib/backpackScan.mjs';
import '../loadout/loadout.css';
import './backpack-scan.css';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_FILES = 2;
const fmt = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('en-US'));
const parseCount = (text) => {
  const clean = String(text ?? '').replace(/[,\s]/g, '');
  if (clean === '') return { empty: true, value: null };
  if (!/^\d{1,9}$/.test(clean)) return { empty: false, value: NaN };
  return { empty: false, value: Number(clean) };
};
const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); }; // Enter must not submit the surrounding form

/** A tile cropped from the screenshot, drawn on a canvas. The picture stays in memory on this device. */
function TileThumb({ pixels, rect }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !pixels || !rect) return;
    try {
      const small = resizeTo(crop(pixels, rect), 96, 96);
      canvas.width = 96; canvas.height = 96;
      canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(small.data), 96, 96), 0, 0);
    } catch { /* no thumbnail: the row still reads fine */ }
  }, [pixels, rect]);
  return <canvas ref={ref} className="bps-thumb" width="96" height="96" aria-hidden="true" />;
}

function CountInput({ id, value, onValue, label, invalid }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : fmt(value));
  useEffect(() => {
    if (Number.isNaN(value)) return; // the member is mid-typing something that is not a number: leave the box alone
    const p = parseCount(text);
    if (p.value === (value ?? null)) return;
    setText(value === null || value === undefined ? '' : fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id} className="bps-input" type="text" inputMode="numeric" autoComplete="off" aria-label={label}
      aria-invalid={invalid ? 'true' : undefined} value={text} onKeyDown={noEnter}
      onChange={(e) => { setText(e.target.value); const p = parseCount(e.target.value); onValue(p.empty ? null : p.value); }}
      onBlur={() => { const p = parseCount(text); if (!p.empty && Number.isFinite(p.value)) setText(fmt(p.value)); }}
    />
  );
}

function ResourceRow({ row, edit, confirmed, pixels, onEdit, onConfirm, t, ids }) {
  const value = edit && 'value' in edit ? edit.value : row.readValue;
  const edited = Boolean(edit);
  const blocked = row.needsCheck && !confirmed && !edited;
  const bad = value !== null && (!Number.isFinite(value) || value < 0);
  return (
    <li className="lo-rv-row bps-row" data-check={blocked ? 'true' : undefined}>
      <span className="lo-rv-art">{row.tile && pixels ? <TileThumb pixels={pixels} rect={row.tile} /> : <span className="lo-rv-blank" aria-hidden="true">{row.short}</span>}</span>
      <div className="lo-rv-main">
        <label className="lo-rv-title" htmlFor={ids.value}>{row.title}</label>
        {!row.found && !edited ? <p className="lo-rv-hint">{t('backpack.notFound')}</p> : null}
        {row.needsCheck ? <span className="lo-rv-badge" data-state={blocked ? 'check' : 'done'}>{blocked ? t('backpack.checkThis') : edited ? t('backpack.fixed') : t('backpack.confirmed')}</span> : null}
      </div>
      <div className="bps-qty">
        <CountInput id={ids.value} value={value} label={`${row.title}: ${t('backpack.field.quantity')}`} invalid={bad} onValue={(v) => onEdit(row.id, { value: v })} />
        {blocked ? <button type="button" className="lo-btn lo-btn-secondary" onClick={() => onConfirm(row.id)}>{t('backpack.thisIsRight')}</button> : null}
      </div>
    </li>
  );
}

function SpeedupRow({ row, edit, confirmed, removed, pixels, onEdit, onConfirm, onRemove, t, base }) {
  const [open, setOpen] = useState(row.needsCheck);
  const f = {
    category: edit && 'category' in edit ? edit.category : row.readCategory,
    denomination: edit && 'denomination' in edit ? edit.denomination : row.readDenomination,
    quantity: edit && 'quantity' in edit ? edit.quantity : row.readQuantity,
  };
  const edited = Boolean(edit);
  const blocked = row.needsCheck && !confirmed && !edited;
  const title = `${f.category ? categoryLabel(f.category) : '?'} · ${f.denomination ? denominationLabel(f.denomination) : '?'}`;
  if (removed) {
    return (
      <li className="lo-rv-row bps-row" data-removed="true">
        <span className="lo-rv-art"><TileThumb pixels={pixels} rect={row.tile} /></span>
        <div className="lo-rv-main"><p className="lo-rv-title">{title}</p><span className="lo-rv-badge" data-state="done">{t('backpack.removed')}</span></div>
        <button type="button" className="lo-btn lo-btn-text" onClick={() => onRemove(row.id, false)}>{t('backpack.undo')}</button>
      </li>
    );
  }
  return (
    <li className="lo-rv-row bps-row" data-check={blocked ? 'true' : undefined}>
      <span className="lo-rv-art">{row.tile && pixels ? <TileThumb pixels={pixels} rect={row.tile} /> : null}</span>
      <div className="lo-rv-main">
        <p className="lo-rv-title">{title}</p>
        <p className="lo-rv-value">{Number.isFinite(f.quantity) ? `× ${fmt(f.quantity)}` : t('backpack.unreadable')}</p>
        {row.needsCheck ? <span className="lo-rv-badge" data-state={blocked ? 'check' : 'done'}>{blocked ? t('backpack.checkThis') : edited ? t('backpack.fixed') : t('backpack.confirmed')}</span> : null}
      </div>
      <button type="button" className="lo-btn lo-btn-text" aria-expanded={open} aria-label={`${t('backpack.change')}: ${title}`} onClick={() => setOpen((o) => !o)}>{open ? t('backpack.close') : t('backpack.change')}</button>
      {open ? (
        <div className="lo-rv-edit">
          <div className="lo-rv-fields">
            <label htmlFor={`${base}-c`}>{t('backpack.field.category')}</label>
            <select id={`${base}-c`} value={f.category || ''} onChange={(e) => onEdit(row.id, { category: e.target.value || null })}>
              <option value="">{t('backpack.select')}</option>
              {CATEGORY_IDS.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
            <label htmlFor={`${base}-d`}>{t('backpack.field.denomination')}</label>
            <select id={`${base}-d`} value={f.denomination || ''} onChange={(e) => onEdit(row.id, { denomination: e.target.value || null })}>
              <option value="">{t('backpack.select')}</option>
              {SPEEDUP_DENOMINATIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <label htmlFor={`${base}-q`}>{t('backpack.field.quantity')}</label>
            <CountInput id={`${base}-q`} value={f.quantity} label={`${title}: ${t('backpack.field.quantity')}`} invalid={f.quantity !== null && !Number.isFinite(f.quantity)} onValue={(v) => onEdit(row.id, { quantity: v })} />
          </div>
          <div className="bps-row-actions">
            {blocked ? <button type="button" className="lo-btn lo-btn-secondary" onClick={() => onConfirm(row.id)}>{t('backpack.thisIsRight')}</button> : null}
            <button type="button" className="lo-btn lo-btn-text" onClick={() => onRemove(row.id, true)}>{t('backpack.remove')}</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * "Fill from my backpack screenshots": pick 1-2 Backpack screenshots, read them on this device, review, then hand the numbers
 * to the form. The picture is decoded in memory and thrown away; only numbers leave this component.
 *
 * targets: [{ key, source: 'tg'|'ttg'|'tg_dust'|'research_days'|'troop_days', label, current }] the form boxes this fills.
 * onApply({ fill: {key: text}, snapshot, corrections, engineVersion }) is called once the member presses "Use these numbers".
 * variant 'speedups': the compact card for the Noble Advisor form (speedups tab only).
 */
export default function BackpackScan({ targets, onApply, variant = 'full', note }) {
  const t = useT();
  const uid = useId();
  const input = useRef(null);
  const heading = useRef(null);
  const chooseBtn = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);
  const [pixels, setPixels] = useState([]);
  const [engine, setEngine] = useState('');
  const [state, setState] = useState({ edits: {}, confirmed: {}, removed: {}, added: [] });
  const [replace, setReplace] = useState({});
  const [draft, setDraft] = useState({ category: '', denomination: '', quantity: null });
  const compact = variant === 'speedups';
  const busy = phase === 'reading';

  useEffect(() => { if (phase === 'review') heading.current?.focus(); }, [phase]);

  function reset() {
    setPhase('idle'); setReview(null); setPixels([]); setState({ edits: {}, confirmed: {}, removed: {}, added: [] });
    setReplace({}); setStatus(''); setError(''); setDraft({ category: '', denomination: '', quantity: null });
  }

  async function scan(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || busy) return;
    setError(''); setPhase('reading');
    const used = files.slice(0, MAX_FILES);
    try {
      const results = []; const kept = [];
      let engineVersion = '';
      let first = '';
      for (let i = 0; i < used.length; i += 1) {
        setStatus(t('backpack.reading', { current: i + 1, total: used.length }));
        const decoded = await decodeImageFile(used[i]);
        if (!decoded.ok) { first ||= decoded.message; continue; }
        await new Promise((resolve) => { setTimeout(resolve); }); // let the progress text paint before the CPU work
        const { runScan, ENGINE_VERSION } = await import('../../lib/scan/engine.mjs');
        engineVersion = ENGINE_VERSION;
        const result = runScan('backpack_inventory', decoded.pixels);
        if (result.status !== 'ok') first ||= result.status === 'invalid_image' ? t('backpack.err.tooSmall') : t('backpack.err.notBackpack');
        else if (compact && result.tab !== 'speedups') first ||= t('backpack.err.needSpeedups');
        else { results.push({ index: kept.length, result }); kept.push(decoded.pixels); }
      }
      if (!results.length) { setError(first || t('backpack.err.generic')); setStatus(''); setPhase('idle'); return; }
      const built = buildBackpackReview(results);
      if (!built.ok) { setError(t('backpack.err.notBackpack')); setStatus(''); setPhase('idle'); return; }
      const extra = [];
      if (files.length > MAX_FILES) extra.push(t('backpack.tooMany'));
      if (first) extra.push(first);
      setReview({ ...built, extra: [...built.notes.map(() => t('backpack.sameTwice')), ...extra] });
      setPixels(kept); setEngine(engineVersion); setStatus('');
      setPhase('review');
    } catch {
      setError(t('backpack.err.generic')); setStatus(''); setPhase('idle');
    }
  }

  function pick(e) { const files = e.target.files; scan(files); e.target.value = ''; }
  function drop(e) { e.preventDefault(); setOver(false); scan(e.dataTransfer?.files); }
  const setEdit = (id, patch) => setState((s) => ({ ...s, edits: { ...s.edits, [id]: { ...(s.edits[id] || {}), ...patch } } }));
  const confirmRow = (id) => setState((s) => ({ ...s, confirmed: { ...s.confirmed, [id]: true } }));
  const removeRow = (id, on) => setState((s) => ({ ...s, removed: { ...s.removed, [id]: on } }));

  const evaluation = review ? evaluateBackpack(review, state) : null;
  const pending = evaluation ? evaluation.pending.length : 0;
  const resourcePixels = (row) => pixels[row.imageIndex];
  const planned = review ? targets.map((tg) => {
    const value = fillValueFor(tg.source, evaluation);
    const current = String(tg.current ?? '').trim();
    const same = value !== null && current !== '' && Number(current.replace(/[,\s+]/g, '')) === Number(value);
    return { ...tg, value, current, replaces: value !== null && current !== '' && !same, same };
  }) : [];

  function use() {
    if (!evaluation?.ok) return;
    const fill = {};
    for (const p of planned) if (p.value !== null && (!p.replaces || replace[p.key])) fill[p.key] = p.value;
    onApply({ fill, snapshot: backpackSnapshot(evaluation, { engineVersion: engine }), corrections: backpackCorrections(review, state), engineVersion: engine });
    reset();
    setStatus(t('backpack.applied', { count: Object.keys(fill).length }));
    setTimeout(() => chooseBtn.current?.focus(), 0);
  }

  function addDraft() {
    const q = draft.quantity;
    if (!draft.category || !draft.denomination || !Number.isInteger(q) || q < 0) return;
    setState((s) => ({ ...s, added: [...s.added, { id: `add:${s.added.length + 1}`, category: draft.category, denomination: draft.denomination, quantity: q }] }));
    setDraft({ category: '', denomination: '', quantity: null });
  }

  const guide = compact ? ['backpack.guideNoble.open', 'backpack.guide.private'] : ['backpack.guide.open', 'backpack.guide.both', 'backpack.guide.private'];

  if (phase !== 'review') {
    return (
      <div className={`bps lo${compact ? ' bps-compact' : ''}`} data-tour="backpack-scan">
        <div className="bps-intro">
          <h3 className="bps-title" id={`${uid}-t`}>{compact ? t('backpack.titleNoble') : t('backpack.title')}</h3>
          <ul className="bps-guide" aria-labelledby={`${uid}-t`}>{guide.map((k) => <li key={k}>{t(k)}</li>)}</ul>
          <p className="lo-note">{t('backpack.ownNote')}</p>
          {note ? <p className="lo-note">{note}</p> : null}
        </div>
        <div className="lo-drop bps-drop" data-over={over ? 'true' : undefined} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
          <button type="button" ref={chooseBtn} className="lo-btn lo-btn-secondary" disabled={busy} aria-describedby={`${uid}-s`} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }}>
            {busy ? t('backpack.busy') : compact ? t('backpack.chooseOne') : t('backpack.chooseFiles')}
          </button>
          <span className="lo-drop-hint" aria-hidden="true">{t('backpack.drop')}</span>
          <input ref={input} type="file" accept={ACCEPT} multiple={!compact} className="lo-sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
        </div>
        <p id={`${uid}-s`} className="lo-scan-status" role="status" aria-live="polite">{status}</p>
        {error ? <p className="lo-scan-error" role="alert">{error}</p> : null}
      </div>
    );
  }

  const sp = review.speedupRows || [];
  const minutes = evaluation.minutes;
  const toCheck = review.summary.toCheck;
  const hasResources = !compact && review.resourceRows;
  const showSpeedups = review.speedupRows !== null;
  const researchMinutes = minutes ? minutes.research + minutes.general : 0;
  return (
    <section className={`bps lo bps-review${compact ? ' bps-compact' : ''}`} aria-labelledby={`${uid}-rt`}>
      <h3 className="lo-rv-heading" id={`${uid}-rt`} ref={heading} tabIndex={-1}>{t('backpack.review.title')}</h3>
      <p className="lo-count" role="status" aria-live="polite">{t('backpack.review.count', { ok: review.summary.total - toCheck, total: review.summary.total, check: toCheck })}</p>
      {review.extra.map((m) => <p key={m} className="lo-note">{m}</p>)}

      {hasResources ? (
        <>
          <h4 className="lo-rv-group">{t('backpack.group.resources')}</h4>
          <ul className="lo-rv-list">
            {review.resourceRows.map((row) => (
              <ResourceRow key={row.id} row={row} edit={state.edits[row.id]} confirmed={Boolean(state.confirmed[row.id])} pixels={resourcePixels(row)} t={t} ids={{ value: `${uid}-${row.key}` }} onEdit={setEdit} onConfirm={confirmRow} />
            ))}
          </ul>
        </>
      ) : null}
      {!compact && !review.resourceRows ? <p className="lo-note">{t('backpack.noResourcesTab')}</p> : null}

      {showSpeedups ? (
        <>
          <h4 className="lo-rv-group">{t('backpack.group.speedups')}</h4>
          <ul className="lo-rv-list">
            {sp.map((row) => (
              <SpeedupRow key={row.id} row={row} base={`${uid}-${row.id.replace(/[^a-z0-9]/gi, '-')}`} edit={state.edits[row.id]} confirmed={Boolean(state.confirmed[row.id])} removed={Boolean(state.removed[row.id])} pixels={pixels[row.imageIndex]} t={t} onEdit={setEdit} onConfirm={confirmRow} onRemove={removeRow} />
            ))}
            {state.added.map((a) => (
              <li key={a.id} className="lo-rv-row bps-row">
                <span className="lo-rv-art"><span className="lo-rv-blank" aria-hidden="true">+</span></span>
                <div className="lo-rv-main"><p className="lo-rv-title">{categoryLabel(a.category)} · {denominationLabel(a.denomination)}</p><p className="lo-rv-value">× {fmt(a.quantity)}</p><span className="lo-rv-badge" data-state="done">{t('backpack.addedByYou')}</span></div>
                <button type="button" className="lo-btn lo-btn-text" onClick={() => setState((s) => ({ ...s, added: s.added.filter((x) => x.id !== a.id) }))}>{t('backpack.remove')}</button>
              </li>
            ))}
          </ul>
          <details className="bps-add">
            <summary>{t('backpack.add.title')}</summary>
            <div className="lo-rv-fields">
              <label htmlFor={`${uid}-ac`}>{t('backpack.field.category')}</label>
              <select id={`${uid}-ac`} value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>
                <option value="">{t('backpack.select')}</option>
                {CATEGORY_IDS.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              </select>
              <label htmlFor={`${uid}-ad`}>{t('backpack.field.denomination')}</label>
              <select id={`${uid}-ad`} value={draft.denomination} onChange={(e) => setDraft((d) => ({ ...d, denomination: e.target.value }))}>
                <option value="">{t('backpack.select')}</option>
                {SPEEDUP_DENOMINATIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
              <label htmlFor={`${uid}-aq`}>{t('backpack.field.quantity')}</label>
              <CountInput id={`${uid}-aq`} value={draft.quantity} label={t('backpack.field.quantity')} onValue={(v) => setDraft((d) => ({ ...d, quantity: v }))} />
            </div>
            <button type="button" className="lo-btn lo-btn-secondary" disabled={!draft.category || !draft.denomination || !Number.isInteger(draft.quantity)} onClick={addDraft}>{t('backpack.add.button')}</button>
          </details>
        </>
      ) : null}

      <div className="bps-summary">
        <h4 className="lo-rv-group">{t('backpack.summary.title')}</h4>
        {hasResources ? (
          <dl className="bps-dl">
            {[['TG', evaluation.resources.tg], ['TTG', evaluation.resources.ttg], ['TG Dust', evaluation.resources.tg_dust]].map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v === null ? t('backpack.notRead') : fmt(v)}</dd></div>
            ))}
          </dl>
        ) : null}
        {minutes ? (
          <>
            <table className="bps-table">
              <caption className="lo-sr-only">{t('backpack.summary.caption')}</caption>
              <thead><tr><th scope="col">{t('backpack.col.type')}</th><th scope="col">{t('backpack.col.minutes')}</th><th scope="col">{t('backpack.col.days')}</th></tr></thead>
              <tbody>
                <tr><th scope="row">{categoryLabel('construction')}</th><td>{fmt(minutes.construction)}</td><td>{displayDays(minutes.construction / 1440)}</td></tr>
                <tr><th scope="row">{categoryLabel('research')}</th><td>{fmt(researchMinutes)}</td><td>{displayDays(researchMinutes / 1440)}</td></tr>
                <tr className="bps-sub"><th scope="row">{t('backpack.ofWhichGeneral')}</th><td>{fmt(minutes.general)}</td><td>{displayDays(minutes.general / 1440)}</td></tr>
                <tr><th scope="row">{categoryLabel('troop')}</th><td>{fmt(minutes.troop)}</td><td>{displayDays(minutes.troop / 1440)}</td></tr>
              </tbody>
            </table>
            <p className="lo-note">{t('backpack.researchIncludesGeneral')}</p>
          </>
        ) : null}
      </div>

      <div className="bps-fill">
        <h4 className="lo-rv-group">{t('backpack.fill.title')}</h4>
        <ul className="bps-fill-list">
          {planned.map((p) => (
            <li key={p.key}>
              <span className="bps-fill-label">{p.label}</span>
              {p.value === null ? <span className="bps-fill-val">{t('backpack.fill.none')}</span> : <span className="bps-fill-val">{p.value}</span>}
              {p.replaces && p.value !== null ? (
                <label className="bps-check bps-replace">
                  <input type="checkbox" checked={Boolean(replace[p.key])} onChange={(e) => setReplace((r) => ({ ...r, [p.key]: e.target.checked }))} />
                  <span>{t('backpack.fill.replace', { typed: p.current })}</span>
                </label>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="lo-note">{t('backpack.fill.lessNote')}</p>
      </div>

      <div className="lo-rv-actions">
        <p className="lo-note" role="status" aria-live="polite">{pending > 0 ? t('backpack.pending', { count: pending }) : t('backpack.allChecked')}</p>
        <button type="button" className="lo-btn lo-btn-primary" disabled={pending > 0} onClick={use}>{t('backpack.use')}</button>
        <button type="button" className="lo-btn lo-btn-text" onClick={reset}>{t('backpack.cancel')}</button>
      </div>
    </section>
  );
}
