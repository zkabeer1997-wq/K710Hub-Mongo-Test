'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Input } from '../ui';
import ConfirmDialog from './ConfirmDialog';
import styles from './ToolDataEditor.module.css';
import extra from './ToolPacksPanels.module.css';
import { stampText, toNumber } from './toolAdminText';
import { COLUMN_NAME_MAX, MAX_COLUMNS, MAX_DATABASES, MAX_ROWS, NAME_MAX, ROW_LABEL_MAX, validateDatabase } from '../../lib/toolDatabases.mjs';

// "Your databases" on Tool database: simple named tables (columns, labelled rows, numeric values,
// ordering) that the admin can add, edit and delete. Every save is validated again on the server.

const blankDraft = () => ({ id: null, name: '', columns: ['Value'], rows: [{ label: '', values: [''] }], updated_at: null });
const toDraft = (db) => ({ id: db.id, name: db.name, columns: [...db.columns], rows: db.rows.map((r) => ({ label: r.label, values: r.values.map(String) })), updated_at: db.updated_at });
const payloadOf = (draft) => ({
  name: draft.name,
  columns: draft.columns,
  rows: draft.rows.map((r) => ({ label: r.label, values: r.values.map(toNumber) })),
});

function move(list, from, to) {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export default function DatabasesManager({ onDirtyChange }) {
  const [databases, setDatabases] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ text: '', tone: '' });
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    let live = true;
    fetch('/api/admin-tool-databases', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        if (live) { setDatabases(data.databases); setLoaded(true); }
      })
      .catch((err) => live && setStatus({ text: err.message, tone: 'error' }));
    return () => { live = false; };
  }, []);

  function touch() {
    setDirty(true);
    onDirtyChange?.(true);
    setStatus({ text: '', tone: '' });
  }
  function leaveEditor() {
    setDraft(null);
    setDirty(false);
    onDirtyChange?.(false);
  }

  const problem = useMemo(() => {
    if (!draft) return '';
    const others = databases.filter((d) => d.id !== draft.id).map((d) => d.name);
    return validateDatabase(payloadOf(draft), others).error || '';
  }, [draft, databases]);

  async function request(method, body, okText) {
    setSaving(true);
    try {
      const response = await fetch('/api/admin-tool-databases', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
    if (problem) { setStatus({ text: problem, tone: 'error' }); return; }
    const payload = payloadOf(draft);
    const data = await request(draft.id ? 'PUT' : 'POST', draft.id ? { id: draft.id, ...payload } : payload, `Saved "${payload.name.trim()}".`);
    if (!data) return;
    setDatabases((prev) => (draft.id ? prev.map((d) => (d.id === draft.id ? data.database : d)) : [...prev, data.database]));
    setDraft(toDraft(data.database));
    setDirty(false);
    onDirtyChange?.(false);
  }

  async function remove(db) {
    const data = await request('DELETE', { id: db.id }, `Deleted "${db.name}".`);
    if (!data) return;
    setDatabases((prev) => prev.filter((d) => d.id !== db.id));
    if (draft?.id === db.id) leaveEditor();
  }

  async function reorder(db, direction) {
    const data = await request('PATCH', { id: db.id, move: direction }, `Moved "${db.name}" ${direction}.`);
    if (data) setDatabases(data.databases);
  }

  const edit = (patch) => { setDraft((d) => ({ ...d, ...patch })); touch(); };
  const setColumn = (c, value) => edit({ columns: draft.columns.map((x, i) => (i === c ? value : x)) });
  const addColumn = () => edit({ columns: [...draft.columns, ''], rows: draft.rows.map((r) => ({ ...r, values: [...r.values, ''] })) });
  const removeColumn = (c) => edit({ columns: draft.columns.filter((_, i) => i !== c), rows: draft.rows.map((r) => ({ ...r, values: r.values.filter((_, i) => i !== c) })) });
  const setRow = (r, patch) => edit({ rows: draft.rows.map((x, i) => (i === r ? { ...x, ...patch } : x)) });
  const setValue = (r, c, value) => setRow(r, { values: draft.rows[r].values.map((x, i) => (i === c ? value : x)) });
  const addRow = () => edit({ rows: [...draft.rows, { label: '', values: draft.columns.map(() => '') }] });

  if (!loaded && !status.text) return <p className={styles.note}>Loading...</p>;

  // ---- editor
  if (draft) {
    return (
      <section className={styles.section} aria-label={draft.id ? `Edit ${draft.name}` : 'Add a database'}>
        <h2>{draft.id ? 'Edit database' : 'Add a database'}</h2>
        <p className={styles.note}>A simple table: name it, set up to {MAX_COLUMNS} numeric columns and up to {MAX_ROWS} rows. Nothing is prefilled with game values; enter your own numbers.</p>
        <div aria-live="polite">
          {status.text && <p className={styles.status} data-tone={status.tone} role="status">{status.text}</p>}
          {dirty && problem && !status.text && <p className={styles.status} data-tone="info">{problem}</p>}
        </div>
        <fieldset disabled={saving} className={styles.fieldset}>
          <legend className="sr-only">Database details</legend>
          <div className={extra.formGrid}>
            <Field label="Database name" htmlFor="db-name">
              <Input id="db-name" tone="console" value={draft.name} maxLength={NAME_MAX} onChange={(e) => edit({ name: e.target.value })} placeholder="For example: Chest odds" />
            </Field>
          </div>

          <h3 className={extra.subhead}>Columns</h3>
          <ul className={extra.columnList}>
            {draft.columns.map((name, c) => (
              <li key={c}>
                <input
                  className={`k-input ${styles.input}`}
                  aria-label={`Column ${c + 1} name`}
                  value={name}
                  maxLength={COLUMN_NAME_MAX}
                  onChange={(e) => setColumn(c, e.target.value)}
                  placeholder={`Column ${c + 1}`}
                />
                <Button variant="quiet" disabled={draft.columns.length <= 1} aria-label={`Remove column ${c + 1}`} onClick={() => removeColumn(c)}>Remove</Button>
              </li>
            ))}
          </ul>
          <Button variant="quiet" disabled={draft.columns.length >= MAX_COLUMNS} onClick={addColumn}>Add column</Button>

          <h3 className={extra.subhead}>Rows <span className={extra.count}>{draft.rows.length} of {MAX_ROWS}</span></h3>
          {draft.rows.length === 0 ? (
            <p className={styles.note}>No rows yet.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className={`admin-table stack-table ${styles.table}`}>
                <thead>
                  <tr>
                    <th scope="col">Row label</th>
                    {draft.columns.map((c, i) => <th scope="col" key={i}>{c.trim() || `Column ${i + 1}`}</th>)}
                    <th scope="col">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((row, r) => (
                    <tr key={r}>
                      <th scope="row" className={styles.rowName} data-label="Row label">
                        <input className={`k-input ${styles.input}`} aria-label={`Row ${r + 1} label`} value={row.label} maxLength={ROW_LABEL_MAX} onChange={(e) => setRow(r, { label: e.target.value })} placeholder={`Row ${r + 1}`} />
                      </th>
                      {draft.columns.map((c, i) => {
                        const bad = !Number.isFinite(toNumber(row.values[i]));
                        return (
                          <td key={i} data-label={c.trim() || `Column ${i + 1}`}>
                            <input
                              className={`k-input ${styles.input}`}
                              aria-label={`${row.label.trim() || `Row ${r + 1}`}: ${c.trim() || `Column ${i + 1}`}`}
                              aria-invalid={bad && dirty ? 'true' : 'false'}
                              type="number"
                              inputMode="decimal"
                              step="any"
                              value={row.values[i] ?? ''}
                              onChange={(e) => setValue(r, i, e.target.value)}
                            />
                          </td>
                        );
                      })}
                      <td data-label="Order" className={extra.orderCell}>
                        <span className={extra.rowTools}>
                          <Button variant="quiet" disabled={r === 0} aria-label={`Move row ${r + 1} up`} onClick={() => edit({ rows: move(draft.rows, r, r - 1) })}>Up</Button>
                          <Button variant="quiet" disabled={r === draft.rows.length - 1} aria-label={`Move row ${r + 1} down`} onClick={() => edit({ rows: move(draft.rows, r, r + 1) })}>Down</Button>
                          <Button variant="quiet" aria-label={`Delete row ${r + 1}`} onClick={() => edit({ rows: draft.rows.filter((_, i) => i !== r) })}>Delete</Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button variant="quiet" disabled={draft.rows.length >= MAX_ROWS} onClick={addRow}>Add row</Button>
        </fieldset>

        <div className={styles.actions} role="region" aria-label="Save database">
          <span className={styles.stamp}>{dirty ? 'Unsaved changes' : stampText(draft.updated_at, 'Not saved yet.')}</span>
          {draft.id && <Button variant="quiet" className={extra.dangerQuiet} disabled={saving} onClick={() => setConfirm({ kind: 'delete', db: databases.find((d) => d.id === draft.id) })}>Delete database</Button>}
          <Button variant="quiet" disabled={saving} onClick={() => (dirty ? setConfirm({ kind: 'discard' }) : leaveEditor())}>{dirty ? 'Discard changes' : 'Back to list'}</Button>
          <Button onClick={save} disabled={saving || !dirty}>{saving ? 'Saving...' : draft.id ? 'Save changes' : 'Create database'}</Button>
        </div>
        {renderConfirm()}
      </section>
    );
  }

  // ---- list
  return (
    <section className={styles.section} aria-label="Your databases">
      <h2>Your databases</h2>
      <p className={styles.note}>Named tables you maintain yourself, up to {MAX_DATABASES}. They are stored for admins; no member tool reads them yet.</p>
      <div aria-live="polite">
        {status.text && <p className={styles.status} data-tone={status.tone} role="status">{status.text}</p>}
      </div>
      <div className={extra.listHead}>
        <Button disabled={databases.length >= MAX_DATABASES} onClick={() => { setDraft(blankDraft()); setStatus({ text: '', tone: '' }); }}>Add database</Button>
        {databases.length >= MAX_DATABASES && <span className={styles.stamp}>Limit reached. Delete one to add another.</span>}
      </div>
      {databases.length === 0 ? (
        <p className={styles.note}>No databases yet. Add one to start a table of your own.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className={`admin-table stack-table ${styles.table}`}>
            <thead><tr><th scope="col">Name</th><th scope="col">Columns</th><th scope="col">Rows</th><th scope="col">Last saved</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {databases.map((db, i) => (
                <tr key={db.id}>
                  <th scope="row" className={styles.rowName} data-label="Name">{db.name}</th>
                  <td data-label="Columns">{db.columns.length}</td>
                  <td data-label="Rows">{db.rows.length}</td>
                  <td data-label="Last saved">{stampText(db.updated_at).replace('Last saved ', '')}</td>
                  <td data-label="Actions">
                    <span className={extra.rowTools}>
                      <Button variant="quiet" aria-label={`Edit ${db.name}`} onClick={() => { setDraft(toDraft(db)); setStatus({ text: '', tone: '' }); }}>Edit</Button>
                      <Button variant="quiet" disabled={i === 0 || saving} aria-label={`Move ${db.name} up`} onClick={() => reorder(db, 'up')}>Up</Button>
                      <Button variant="quiet" disabled={i === databases.length - 1 || saving} aria-label={`Move ${db.name} down`} onClick={() => reorder(db, 'down')}>Down</Button>
                      <Button variant="quiet" className={extra.dangerQuiet} aria-label={`Delete ${db.name}`} onClick={() => setConfirm({ kind: 'delete', db })}>Delete</Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {renderConfirm()}
    </section>
  );

  function renderConfirm() {
    return (
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'discard' ? 'Discard changes?' : 'Delete this database?'}
        message={confirm?.kind === 'discard' ? 'Your unsaved edits to this database will be lost.' : `"${confirm?.db?.name || ''}" and all of its rows will be permanently deleted.`}
        confirmLabel={confirm?.kind === 'discard' ? 'Discard changes' : 'Delete database'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const current = confirm;
          setConfirm(null);
          if (current.kind === 'discard') leaveEditor();
          else remove(current.db);
        }}
      />
    );
  }
}
