'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui';
import ConfirmDialog from './ConfirmDialog';
import styles from './ToolDataEditor.module.css';
import extra from './ToolPacksPanels.module.css';
import { stampText } from './toolAdminText';

// Editable version of the charm level / governor gear tier tables on Tool database. The admin edits
// numbers only (row names are fixed); the full table is validated again on the server and stored as
// an override. "Reset to built-in values" deletes the override so the checked-in values apply.

const RARITY_COLORS = { Green: '#3fbf6a', Blue: '#3f8fe0', Purple: '#a866e0', Gold: '#d9a94e', Red: '#e0554f' };

function cellError(col, value) {
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value))) return 'Enter a number.';
  const n = Number(value);
  if (n < col.min || n > col.max) return `${col.min.toLocaleString()} to ${col.max.toLocaleString()}.`;
  const scale = 10 ** col.decimals;
  if (Math.abs(n * scale - Math.round(n * scale)) > 1e-6) return col.decimals ? `Up to ${col.decimals} decimals.` : 'Whole numbers only.';
  return '';
}

export default function ReferenceTableEditor({ tableKey, onDirtyChange }) {
  const [table, setTable] = useState(null);
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ text: '', tone: '' });
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/admin-tool-reference', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        const found = data.tables.find((t) => t.key === tableKey);
        if (live && found) {
          setTable(found);
          setRows(found.rows);
        }
      })
      .catch((err) => live && setStatus({ text: err.message, tone: 'error' }));
    return () => { live = false; };
  }, [tableKey]);

  function markDirty(value) {
    setDirty(value);
    onDirtyChange?.(value);
  }

  const columns = useMemo(() => table?.columns || [], [table]);
  const errors = useMemo(() => {
    const out = {};
    for (const row of rows) for (const col of columns) {
      const msg = cellError(col, row[col.key]);
      if (msg) out[`${row.id}.${col.key}`] = msg;
    }
    return out;
  }, [rows, columns]);
  const errorCount = Object.keys(errors).length;
  const changedCount = rows.reduce((n, row, i) => n + columns.filter((c) => Number(row[c.key]) !== table?.defaults[i]?.[c.key]).length, 0);

  function setCell(id, key, raw) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: raw === '' ? '' : Number(raw) } : r)));
    markDirty(true);
    setStatus({ text: '', tone: '' });
  }

  async function send(payload, okText) {
    setSaving(true);
    try {
      const response = await fetch('/api/admin-tool-reference', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableKey, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setTable(data.table);
      setRows(data.table.rows);
      markDirty(false);
      setStatus({ text: okText, tone: 'ok' });
    } catch (err) {
      setStatus({ text: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (errorCount) {
      setStatus({ text: `Fix ${errorCount} highlighted value${errorCount > 1 ? 's' : ''} before saving.`, tone: 'error' });
      return;
    }
    send({ rows: rows.map((r) => Object.fromEntries([['id', r.id], ...columns.map((c) => [c.key, r[c.key]])])) }, `Saved ${table.label}.`);
  }

  if (!table) return status.text ? <p className={styles.status} data-tone="error" role="alert">{status.text}</p> : <p className={styles.note}>Loading...</p>;

  return (
    <section className={styles.section} aria-label={table.label}>
      <h2>{table.label}</h2>
      <p className={styles.note}>
        Edit the numbers; row names are fixed. Values are stored as an override in the database and the built-in values stay as the fallback.
        {' '}<strong>Used by:</strong> {table.used_by}
      </p>
      <div aria-live="polite">
        {status.text && <p className={styles.status} data-tone={status.tone} role="status">{status.text}</p>}
      </div>
      <fieldset disabled={saving} className={styles.fieldset}>
        <legend className="sr-only">{table.label} values</legend>
        <div className={`admin-table-wrap ${styles.refWrap}`}>
          <table className={`admin-table stack-table ${styles.table}`}>
            <thead>
              <tr>
                <th scope="col">{table.idLabel}</th>
                {columns.map((c) => <th scope="col" key={c.key}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rarity = tableKey === 'gear-tiers' ? row.label.split(' ')[0] : '';
                return (
                  <tr key={row.id}>
                    <th scope="row" className={styles.rowName} data-label={table.idLabel}>
                      {rarity && <span className={styles.badge} style={{ '--badge-color': RARITY_COLORS[rarity] || '#8ea9b9' }}>{rarity}</span>}
                      {' '}{rarity ? row.label.slice(rarity.length).trim() || 'Base' : row.label}
                    </th>
                    {columns.map((col) => {
                      const id = `${tableKey}-${row.id}-${col.key}`;
                      const err = errors[`${row.id}.${col.key}`];
                      const changed = row[col.key] !== '' && Number(row[col.key]) !== table.defaults[i]?.[col.key];
                      return (
                        <td key={col.key} data-label={col.label} className={changed ? styles.changed : ''}>
                          <span className={styles.cell}>
                            <input
                              className={`k-input ${styles.input}`}
                              aria-label={`${row.label}: ${col.label}`}
                              aria-invalid={err ? 'true' : 'false'}
                              aria-describedby={err ? `err-${id}` : undefined}
                              type="number"
                              inputMode={col.decimals ? 'decimal' : 'numeric'}
                              min={col.min}
                              max={col.max}
                              step={col.decimals ? 1 / 10 ** col.decimals : 1}
                              value={row[col.key] ?? ''}
                              onChange={(e) => setCell(row.id, col.key, e.target.value)}
                            />
                            {err && <span className={styles.err} id={`err-${id}`} role="alert">{err}</span>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </fieldset>
      <div className={styles.actions} role="region" aria-label={`Save ${table.label}`}>
        <span className={styles.stamp}>
          {dirty ? `${changedCount} value${changedCount === 1 ? ' differs' : 's differ'} from the built-in table (unsaved)` : stampText(table.updated_at, table.overridden ? '' : 'Built-in values are in use.')}
        </span>
        <Button variant="quiet" disabled={saving || (!table.overridden && !dirty)} className={extra.dangerQuiet} onClick={() => setConfirmReset(true)}>Reset to built-in values</Button>
        <Button variant="quiet" disabled={!dirty || saving} onClick={() => { setRows(table.rows); markDirty(false); setStatus({ text: '', tone: '' }); }}>Discard changes</Button>
        <Button onClick={save} disabled={saving || !dirty}>{saving ? 'Saving...' : 'Save changes'}</Button>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Reset to built-in values?"
        message={`Delete your saved ${table.label.toLowerCase()} values and go back to the built-in table. This saves immediately.`}
        confirmLabel="Reset to built-in values"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { setConfirmReset(false); send({ reset: true }, `${table.label} was reset to the built-in values.`); }}
      />
    </section>
  );
}
