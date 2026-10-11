'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Input, Select, Tag } from '../ui';
import ConfirmDialog from './ConfirmDialog';
import styles from './ToolDataEditor.module.css';
import extra from './ToolPacksPanels.module.css';
import { stampText, toNumber } from './toolAdminText';
import { CUSTOM_PACK_NAME_MAX, CUSTOM_PACK_TOOLS, MAX_CUSTOM_PACKS_PER_TOOL, validateCustomPack } from '../../lib/customPacks.mjs';

// Pack editing > "Your own packs": add a new real-money pack for a tool that can take extra packs,
// then edit, disable or delete it. Built-in packs are edited in the table above and cannot be
// deleted. Contents are expressed the way that tool's built-in packs are (Shells or Dragon Essence).

const TOOLS = Object.entries(CUSTOM_PACK_TOOLS).map(([key, spec]) => ({ key, ...spec }));
const blank = (tool = TOOLS[0].key) => ({ id: null, tool, name: '', price: '', amount: '', limit: '', updated_at: null });
const money = (n) => `$${Number(n).toFixed(2)}`;

export default function CustomPacksPanel({ onDirtyChange }) {
  const [packs, setPacks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ text: '', tone: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    let live = true;
    fetch('/api/admin-tool-packs', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        if (live) { setPacks(data.packs); setLoaded(true); }
      })
      .catch((err) => live && setStatus({ text: err.message, tone: 'error' }));
    return () => { live = false; };
  }, []);

  const spec = draft ? CUSTOM_PACK_TOOLS[draft.tool] : null;
  const payload = draft ? { name: draft.name, price: toNumber(draft.price), amount: toNumber(draft.amount), limit: toNumber(draft.limit) } : null;
  const siblings = draft ? packs.filter((p) => p.tool_key === draft.tool && p.id !== draft.id) : [];
  const problem = draft ? validateCustomPack(draft.tool, payload, siblings.map((p) => p.name)).error || '' : '';
  const toolFull = draft && !draft.id && siblings.length >= MAX_CUSTOM_PACKS_PER_TOOL;

  function setDirtyBoth(value) {
    setDirty(value);
    onDirtyChange?.(value);
  }
  function change(patch) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirtyBoth(true);
    setStatus({ text: '', tone: '' });
  }
  function close() {
    setDraft(null);
    setDirtyBoth(false);
  }
  function open(next) {
    setDraft(next);
    setDirtyBoth(false);
    setStatus({ text: '', tone: '' });
  }

  async function request(method, body, okText) {
    setSaving(true);
    try {
      const response = await fetch('/api/admin-tool-packs', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setStatus({ text: okText, tone: 'ok' });
      return data;
    } catch (err) {
      setStatus({ text: err.message, tone: 'error' });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (problem || toolFull) {
      setStatus({ text: toolFull ? `Each tool can have at most ${MAX_CUSTOM_PACKS_PER_TOOL} custom packs.` : problem, tone: 'error' });
      return;
    }
    const data = draft.id
      ? await request('PATCH', { id: draft.id, ...payload }, `Saved "${payload.name.trim()}". Members see it when they open or reload the tool.`)
      : await request('POST', { tool: draft.tool, ...payload }, `Added "${payload.name.trim()}". Members see it when they open or reload the tool.`);
    if (!data) return;
    setPacks((prev) => (draft.id ? prev.map((p) => (p.id === data.pack.id ? data.pack : p)) : [...prev, data.pack]));
    close();
  }

  async function toggle(pack) {
    const data = await request('PATCH', { id: pack.id, enabled: !pack.enabled }, `${pack.enabled ? 'Disabled' : 'Enabled'} "${pack.name}". ${pack.enabled ? 'Members no longer see it.' : 'Members see it again.'}`);
    if (data) setPacks((prev) => prev.map((p) => (p.id === pack.id ? data.pack : p)));
  }

  async function remove(pack) {
    const data = await request('DELETE', { id: pack.id }, `Deleted "${pack.name}".`);
    if (data) setPacks((prev) => prev.filter((p) => p.id !== pack.id));
  }

  return (
    <section className={`${styles.section} ${extra.panel}`} aria-label="Your own packs">
      <h2>Your own packs</h2>
      <p className={styles.note}>
        Add a real-money pack that is not in the tables above. Custom packs appear in {TOOLS.map((t) => t.label).join(' and ')}.
        The Charm and Pet pack tools have fixed pack tables and cannot take extra packs. Built-in packs can be edited above but not deleted; your own packs can be edited, disabled or deleted.
      </p>
      <div aria-live="polite">
        {status.text && <p className={styles.status} data-tone={status.tone} role="status">{status.text}</p>}
      </div>

      {draft ? (
        <div className={extra.formWrap} role="group" aria-label={draft.id ? 'Edit pack' : 'Add a pack'}>
          <h3 className={extra.subhead}>{draft.id ? 'Edit pack' : 'Add a pack'}</h3>
          <fieldset disabled={saving} className={styles.fieldset}>
            <legend className="sr-only">Pack details</legend>
            <div className={extra.formGrid}>
              <Field label="Tool" htmlFor="cp-tool">
                <Select id="cp-tool" tone="console" value={draft.tool} disabled={Boolean(draft.id)} onChange={(e) => change({ tool: e.target.value })}>
                  {TOOLS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Pack name" htmlFor="cp-name">
                <Input id="cp-name" tone="console" value={draft.name} maxLength={CUSTOM_PACK_NAME_MAX} onChange={(e) => change({ name: e.target.value })} placeholder="For example: Weekend Pack" />
              </Field>
              <Field label="Price (USD)" htmlFor="cp-price">
                <span className={styles.usd}>
                  <span aria-hidden="true">$</span>
                  <input id="cp-price" className={`k-input ${styles.input}`} type="number" inputMode="decimal" min="0.01" max="999.99" step="0.01" value={draft.price} onChange={(e) => change({ price: e.target.value })} />
                </span>
              </Field>
              <Field label={spec.amountLabel} htmlFor="cp-amount">
                <input id="cp-amount" className={`k-input ${styles.input}`} type="number" inputMode="numeric" min={spec.amountMin} max={spec.amountMax} step={spec.amountStep} value={draft.amount} onChange={(e) => change({ amount: e.target.value })} />
              </Field>
              <Field label={spec.limitLabel} htmlFor="cp-limit">
                <input id="cp-limit" className={`k-input ${styles.input}`} type="number" inputMode="numeric" min={spec.limitMin} max={spec.limitMax} step="1" value={draft.limit} onChange={(e) => change({ limit: e.target.value })} />
              </Field>
            </div>
            <p className={styles.note}>
              Contents are in {spec.currency === 'shells' ? 'Shells' : 'Dragon Essence'}, {spec.amountStep} at a time, like the built-in packs of this tool.
              Enter the real values from the game; nothing is prefilled.
            </p>
          </fieldset>
          {dirty && problem && !status.text && <p className={styles.status} data-tone="info">{problem}</p>}
          <div className={styles.actions} role="region" aria-label="Save pack">
            <span className={styles.stamp}>{dirty ? 'Unsaved changes' : stampText(draft.updated_at, 'Not saved yet.')}</span>
            <Button variant="quiet" disabled={saving} onClick={close}>Cancel</Button>
            <Button onClick={save} disabled={saving || !dirty}>{saving ? 'Saving...' : draft.id ? 'Save pack' : 'Add pack'}</Button>
          </div>
        </div>
      ) : (
        <div className={extra.listHead}>
          <Button onClick={() => open(blank())}>Add a pack</Button>
        </div>
      )}

      {!loaded && !status.text ? <p className={styles.note}>Loading...</p> : packs.length === 0 ? (
        !draft && <p className={styles.note}>No custom packs yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className={`admin-table stack-table ${styles.table}`}>
            <thead><tr><th scope="col">Pack</th><th scope="col">Tool</th><th scope="col">Price</th><th scope="col">Contents</th><th scope="col">Limit</th><th scope="col">Status</th><th scope="col">Last saved</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {packs.map((pack) => {
                const s = CUSTOM_PACK_TOOLS[pack.tool_key];
                return (
                  <tr key={pack.id}>
                    <th scope="row" className={styles.rowName} data-label="Pack">{pack.name}</th>
                    <td data-label="Tool">{s?.label || pack.tool_key}</td>
                    <td data-label="Price">{money(pack.price)}</td>
                    <td data-label="Contents">{pack.amount.toLocaleString()} {s?.currency === 'shells' ? 'Shells' : 'Essence'}</td>
                    <td data-label="Limit">{pack.limit}{s?.currency === 'shells' ? ' per day' : ''}</td>
                    <td data-label="Status"><Tag tone={pack.enabled ? 'success' : 'neutral'}>{pack.enabled ? 'Active' : 'Disabled'}</Tag></td>
                    <td data-label="Last saved">{stampText(pack.updated_at).replace('Last saved ', '')}</td>
                    <td data-label="Actions">
                      <span className={extra.rowTools}>
                        <Button variant="quiet" disabled={saving} aria-label={`Edit ${pack.name}`} onClick={() => open({ id: pack.id, tool: pack.tool_key, name: pack.name, price: String(pack.price), amount: String(pack.amount), limit: String(pack.limit), updated_at: pack.updated_at })}>Edit</Button>
                        <Button variant="quiet" disabled={saving} aria-label={`${pack.enabled ? 'Disable' : 'Enable'} ${pack.name}`} onClick={() => toggle(pack)}>{pack.enabled ? 'Disable' : 'Enable'}</Button>
                        <Button variant="quiet" className={extra.dangerQuiet} disabled={saving} aria-label={`Delete ${pack.name}`} onClick={() => setConfirmDelete(pack)}>Delete</Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this pack?"
        message={`"${confirmDelete?.name || ''}" will be removed from ${CUSTOM_PACK_TOOLS[confirmDelete?.tool_key]?.label || 'the tool'}. To keep it but hide it from members, disable it instead.`}
        confirmLabel="Delete pack"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => { const pack = confirmDelete; setConfirmDelete(null); remove(pack); }}
      />
    </section>
  );
}
