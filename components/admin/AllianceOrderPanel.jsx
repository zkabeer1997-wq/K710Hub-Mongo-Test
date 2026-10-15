'use client';

// Admin > Alliances > "Order on the website". Console surface: compact numbered list of the ACTIVE alliances.
// Superadmins reorder it (drag, or the Move up / Move down / Move to top buttons) and save; everyone else
// sees the same list read-only. The server (PUT /api/admin-alliances/order) re-checks the live role.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui';
import { bandProps } from '../../lib/alliances.mjs';
import styles from './AllianceOrderPanel.module.css';

const same = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

export default function AllianceOrderPanel({ rows, order, onSaved }) {
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [live, setLive] = useState('');
  const [dragTag, setDragTag] = useState('');
  const [overTag, setOverTag] = useState('');
  const focusRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin-whoami', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.isSuperadmin) setIsSuperadmin(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // `rows` arrives already in the website order (the admin list uses the same ordering as the public pages).
  const active = useMemo(() => rows.filter((r) => r.active !== false), [rows]);
  const inactive = useMemo(() => rows.filter((r) => r.active === false), [rows]);
  const savedTags = useMemo(() => active.map((r) => r.tag), [active]);
  useEffect(() => { setDraft(savedTags); }, [savedTags]);

  const byTag = useMemo(() => Object.fromEntries(rows.map((r) => [r.tag, r])), [rows]);
  const dirty = !same(draft, savedTags);

  useEffect(() => {
    if (!focusRef.current) return;
    const { tag, act } = focusRef.current;
    focusRef.current = null;
    const el = document.querySelector(`[data-order-tag="${tag}"][data-order-act="${act}"]:not(:disabled)`)
      || document.querySelector(`[data-order-tag="${tag}"]:not(:disabled)`);
    el?.focus();
  }, [draft]);

  function move(tag, to, act) {
    setNotice('');
    setDraft((list) => {
      const from = list.indexOf(tag);
      const target = Math.max(0, Math.min(list.length - 1, to));
      if (from < 0 || from === target) return list;
      const next = [...list];
      next.splice(from, 1);
      next.splice(target, 0, tag);
      setLive(`${byTag[tag]?.name || tag} moved to position ${target + 1} of ${next.length}.`);
      return next;
    });
    if (act) focusRef.current = { tag, act };
  }

  function drop(targetTag) {
    const from = dragTag;
    setDragTag(''); setOverTag('');
    if (!from || from === targetTag) return;
    move(from, draft.indexOf(targetTag));
  }

  async function save() {
    setSaving(true); setError(''); setNotice('');
    try {
      // Hidden alliances keep a place after the visible ones, so the saved list names every alliance.
      const tags = [...draft, ...inactive.map((r) => r.tag)];
      const response = await fetch('/api/admin-alliances/order', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The order could not be saved.');
      setNotice('Order saved. The website now shows alliances in this order.');
      await onSaved?.();
    } catch (err) {
      setError(err.message || 'The order could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const first = byTag[draft[0]];
  const lastSaved = order?.saved && order.updated_at
    ? `Last saved ${new Date(order.updated_at).toLocaleString()}${order.updated_by ? ` by ${order.updated_by}` : ''}.`
    : 'No order has been saved yet, so the website shows the original order.';

  return (
    <section className={styles.panel} aria-labelledby="alliance-order-h">
      <div className={styles.head}>
        <h2 id="alliance-order-h" className={styles.title}>Order on the website</h2>
        <p className={styles.lead}>The first alliance appears first on the Alliances page, in the Home page schedules and in the Events filters. {lastSaved}</p>
        {!isSuperadmin && <p className={styles.note}>Only a superadmin can change the order.</p>}
      </div>

      {error && <p className="guide-message error" role="alert">{error}</p>}
      {notice && <p className="guide-message success" role="status">{notice}</p>}

      <div className={styles.body}>
        <ol className={styles.list} aria-label="Active alliances in website order">
          {draft.map((tag, index) => {
            const row = byTag[tag];
            if (!row) return null;
            return (
              <li
                key={tag}
                className={`${styles.item} ${dragTag === tag ? styles.dragging : ''} ${overTag === tag && dragTag && dragTag !== tag ? styles.over : ''}`}
                draggable={isSuperadmin && !saving}
                onDragStart={(e) => { setDragTag(tag); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', tag); } catch { /* some browsers refuse */ } }}
                onDragOver={(e) => { if (dragTag) { e.preventDefault(); setOverTag(tag); } }}
                onDragLeave={() => setOverTag((t) => (t === tag ? '' : t))}
                onDrop={(e) => { e.preventDefault(); drop(tag); }}
                onDragEnd={() => { setDragTag(''); setOverTag(''); }}
              >
                <span className={styles.num} aria-hidden="true">{index + 1}</span>
                {isSuperadmin && <span className={styles.grip} aria-hidden="true" title="Drag to reorder">⋮⋮</span>}
                <span className={`${styles.tag} k-wb`} {...bandProps(tag)}>{tag}</span>
                <span className={styles.name}>{row.name}</span>
                <span className={styles.sr}>Position {index + 1} of {draft.length}</span>
                {isSuperadmin && (
                  <span className={styles.actions}>
                    <Button variant="quiet" className={styles.btn} data-order-tag={tag} data-order-act="top" disabled={saving || index === 0} aria-label={`Move ${row.name} to top`} onClick={() => move(tag, 0, 'top')}>Top</Button>
                    <Button variant="quiet" className={styles.btn} data-order-tag={tag} data-order-act="up" disabled={saving || index === 0} aria-label={`Move ${row.name} up`} onClick={() => move(tag, index - 1, 'up')}>Up</Button>
                    <Button variant="quiet" className={styles.btn} data-order-tag={tag} data-order-act="down" disabled={saving || index === draft.length - 1} aria-label={`Move ${row.name} down`} onClick={() => move(tag, index + 1, 'down')}>Down</Button>
                  </span>
                )}
              </li>
            );
          })}
          {draft.length === 0 && <li className={styles.empty}>No active alliances yet.</li>}
        </ol>

        <aside className={styles.preview} aria-label="Preview of the first position">
          <p className={styles.previewLabel}>First on the Alliances page</p>
          {first ? (
            <div className={`${styles.previewBox} k-wb`} {...bandProps(first.tag)}>
              <span className={styles.previewMono} aria-hidden="true">{first.tag}</span>
              <span className={styles.previewName}>{first.name}</span>
              <span className={styles.previewPos}>Top left of the grid</span>
            </div>
          ) : <p className={styles.note}>Nothing to show.</p>}
          {inactive.length > 0 && (
            <div className={styles.hidden}>
              <p className={styles.previewLabel}>Hidden (not on the website, not counted)</p>
              <ul className={styles.hiddenList}>{inactive.map((r) => <li key={r.tag}>{r.tag} · {r.name}</li>)}</ul>
            </div>
          )}
        </aside>
      </div>

      {isSuperadmin && dirty && (
        <div className={styles.bar} role="group" aria-label="Unsaved order">
          <span className={styles.barText}>Unsaved order change</span>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save order'}</Button>
          <Button variant="quiet" onClick={() => { setDraft(savedTags); setError(''); setLive('Order reset.'); }} disabled={saving}>Reset</Button>
        </div>
      )}
      <div className={styles.sr} role="status" aria-live="polite">{live}</div>
    </section>
  );
}
