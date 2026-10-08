'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, Select } from '../ui';
import ConfirmDialog from './ConfirmDialog';
import styles from './ToolDataEditor.module.css';

// Shared editor behind Admin > Tools > Pack editing (kind="pack") and Tool database
// (kind="calc"). It only ever loads and saves the values of its own kind, so a pack page
// can never overwrite calculator data and vice versa (the API enforces the same rule).

export function fieldError(f, value) {
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value))) return 'Enter a number.';
  const n = Number(value);
  if (f.usd) {
    if (n <= 0) return 'Must be more than $0.00.';
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return 'Use at most 2 decimals.';
    if (n < f.min || n > f.max) return `$${f.min.toFixed(2)} to $${f.max.toFixed(2)}.`;
    return '';
  }
  if (n < 0) return 'Cannot be negative.';
  if (!Number.isInteger(n)) return 'Whole numbers only.';
  if (n < f.min || n > f.max) return `${f.min} to ${f.max.toLocaleString()}.`;
  if (n % f.step !== 0) return `Multiples of ${f.step}.`;
  return '';
}

function sectionsOf(fields) {
  const sections = [];
  for (const f of fields) {
    let s = sections.find((x) => x.name === f.section);
    if (!s) sections.push((s = { name: f.section, rows: [], columns: [] }));
    let row = s.rows.find((r) => r.group === f.group);
    if (!row) s.rows.push((row = { group: f.group, cells: {} }));
    row.cells[f.label] = f;
    if (!s.columns.includes(f.label)) s.columns.push(f.label);
  }
  return sections;
}

function stampText(iso) {
  if (!iso) return 'Not saved yet - built-in defaults are in use.';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `Last saved ${d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export default function ToolDataEditor({ kind, intro, otherHref, otherLabel, extraViews = [], savedNote }) {
  const [tools, setTools] = useState([]);
  const [selected, setSelected] = useState('');
  const [values, setValues] = useState({});
  const [status, setStatus] = useState({ text: '', tone: '' });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/admin-tool-settings?kind=${kind}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        setTools(data.tools);
        setSelected(data.tools[0]?.key || '');
        setValues(data.tools[0]?.quantities || {});
        setLoaded(true);
      })
      .catch((err) => setStatus({ text: err.message, tone: 'error' }));
  }, [kind]);

  const extra = extraViews.find((v) => v.key === selected);
  const tool = tools.find((t) => t.key === selected);
  const sections = useMemo(() => sectionsOf(tool?.fields || []), [tool]);
  const errors = useMemo(() => {
    const out = {};
    for (const f of tool?.fields || []) {
      const msg = fieldError(f, values[f.key]);
      if (msg) out[f.key] = msg;
    }
    return out;
  }, [tool, values]);
  const errorCount = Object.keys(errors).length;

  function choose(key) {
    setSelected(key);
    setValues(tools.find((t) => t.key === key)?.quantities || {});
    setDirty(false);
    setStatus({ text: '', tone: '' });
    setQuery('');
  }

  async function send(payload, okText) {
    setSaving(true);
    try {
      const response = await fetch('/api/admin-tool-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: selected, kind, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setTools((prev) => prev.map((t) => (t.key === selected ? { ...t, quantities: data.quantities, updated_at: data.updated_at } : t)));
      setValues(data.quantities);
      setDirty(false);
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
    send({ quantities: values }, `Saved ${tool.label}. ${savedNote}`);
  }

  function setField(key, raw) {
    setValues((prev) => ({ ...prev, [key]: raw === '' ? '' : Number(raw) }));
    setDirty(true);
    setStatus({ text: '', tone: '' });
  }

  const q = query.trim().toLowerCase();
  return (
    <>
      <p className={styles.note}>{intro} <Link href={otherHref}>{otherLabel}</Link></p>
      <div className={styles.toolbar}>
        <Field label="Tool" htmlFor={`tool-${kind}-tool`}>
          <Select id={`tool-${kind}-tool`} tone="console" value={selected} disabled={saving || dirty} onChange={(e) => choose(e.target.value)}>
            {tools.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            {extraViews.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </Select>
        </Field>
        {!extra && (
          <Field label="Find a row" htmlFor={`tool-${kind}-find`}>
            <Input id={`tool-${kind}-find`} tone="console" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Level, tier, pack or item" />
          </Field>
        )}
      </div>
      <div aria-live="polite">
        {status.text && <p className={styles.status} data-tone={status.tone} role="status">{status.text}</p>}
        {dirty && !status.text && <p className={styles.status} data-tone="info">Unsaved changes. Save or discard them before changing tools.</p>}
      </div>

      {extra ? extra.render(styles) : null}

      {!extra && tool && (
        <>
          <div className={styles.actions}>
            <Button onClick={save} disabled={saving || !dirty}>{saving ? 'Saving...' : `Save ${tool.label}`}</Button>
            <Button variant="quiet" disabled={!dirty || saving} onClick={() => choose(selected)}>Discard changes</Button>
            <Button variant="quiet" disabled={saving} onClick={() => setConfirmReset(true)}>Reset to defaults</Button>
            <span className={styles.stamp}>{stampText(tool.updated_at)}</span>
          </div>
          <fieldset disabled={saving} className={styles.fieldset}>
            <legend className="sr-only">{tool.label} values</legend>
            {sections.map((section) => {
              const rows = section.rows.filter((r) => !q || `${r.group} ${section.name}`.toLowerCase().includes(q));
              if (!rows.length) return null;
              return (
                <section className={styles.section} key={section.name}>
                  <h2>{section.name}</h2>
                  <div className="admin-table-wrap">
                    <table className={`admin-table stack-table ${styles.table}`}>
                      <thead>
                        <tr>
                          <th scope="col">{kind === 'pack' ? 'Pack' : 'Row'}</th>
                          {section.columns.map((c) => <th scope="col" key={c}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.group}>
                            <th scope="row" className={styles.rowName} data-label={kind === 'pack' ? 'Pack' : 'Row'}>{row.group}</th>
                            {section.columns.map((c) => {
                              const f = row.cells[c];
                              if (!f) return <td key={c} className={styles.empty} data-label={c}>-</td>;
                              const changed = values[f.key] !== '' && Number(values[f.key]) !== f.value;
                              return (
                                <td key={c} data-label={c} className={changed ? styles.changed : ''}>
                                  <span className={styles.cell}>
                                    <span className={f.usd ? styles.usd : undefined}>
                                      {f.usd && <span aria-hidden="true">$</span>}
                                      <input
                                        className={`k-input ${styles.input}`}
                                        aria-label={`${row.group}: ${c}`}
                                        aria-invalid={errors[f.key] ? 'true' : 'false'}
                                        aria-describedby={errors[f.key] ? `err-${f.key}` : undefined}
                                        type="number"
                                        inputMode={f.usd ? 'decimal' : 'numeric'}
                                        min={f.min}
                                        max={f.max}
                                        step={f.step}
                                        value={values[f.key] ?? ''}
                                        onChange={(e) => setField(f.key, e.target.value)}
                                      />
                                    </span>
                                    {errors[f.key] && <span className={styles.err} id={`err-${f.key}`} role="alert">{errors[f.key]}</span>}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </fieldset>
        </>
      )}
      <ConfirmDialog
        open={confirmReset}
        title="Reset to defaults?"
        message={`Restore every ${kind === 'pack' ? 'pack' : 'calculator'} value for ${tool?.label || 'this tool'} to the built-in defaults. This saves immediately.`}
        confirmLabel="Reset to defaults"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { setConfirmReset(false); send({ reset: true }, `${tool.label} was reset to the built-in defaults.`); }}
      />
      {!loaded && !status.text && <p className={styles.note}>Loading...</p>}
    </>
  );
}
