'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Field, Input, Table, Textarea } from '../../../../components/ui';
import { FORM_GATE_KEYS as ORDER, FORM_GATE_LABELS as LABELS } from '../../../../lib/formGates.mjs';
import { FORM_META_KEYS, FORM_META_TITLES, FORM_FIELDS_REORDERABLE, DEFAULT_FORM_FIELDS } from '../../../../lib/formFieldMeta.mjs';

const OTHER_FORM_KEYS = FORM_META_KEYS.filter((key) => !ORDER.includes(key));

export default function AdminFormGatesPage() {
  const [gates, setGates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [editingFormKey, setEditingFormKey] = useState(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [editorIntro, setEditorIntro] = useState({ kicker: '', heading: '', description: '' });
  const [editorFields, setEditorFields] = useState([]);
  const router = useRouter();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin-form-gates', { cache: 'no-store' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result?.gates)) throw new Error(result?.error || 'Unable to load form status. Please reload the page.');
      const byKey = {};
      const nextDrafts = {};
      for (const gate of result.gates || []) {
        byKey[gate.form_key] = gate;
        nextDrafts[gate.form_key] = gate.message || '';
      }
      setGates(byKey);
      setDrafts(nextDrafts);
    } catch (err) {
      setError(err.message || 'Unable to load form gates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  async function openEditor(formKey) {
    setEditingFormKey(formKey);
    setEditorLoading(true);
    setEditorError('');
    try {
      const response = await fetch(`/api/admin-form-field-meta?form_key=${formKey}`, { cache: 'no-store' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Unable to load form.');
      setEditorIntro(result.intro || { kicker: '', heading: '', description: '' });
      setEditorFields(result.fields || []);
    } catch (err) {
      setEditorError(err.message || 'Unable to load form.');
      setEditorFields((DEFAULT_FORM_FIELDS[formKey] || []).map((f, i) => ({ ...f, order: i, placeholder: f.placeholder || '', help_text: f.help_text || '' })));
    } finally {
      setEditorLoading(false);
    }
  }

  function closeEditor() {
    if (editorSaving) return;
    setEditingFormKey(null);
  }

  function updateEditorField(index, key, value) {
    setEditorFields((current) => current.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
  }

  function moveEditorField(index, direction) {
    setEditorFields((current) => {
      const next = current.slice();
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((f, i) => ({ ...f, order: i }));
    });
  }

  async function saveEditor() {
    if (!editingFormKey) return;
    setEditorSaving(true);
    setEditorError('');
    try {
      const response = await fetch('/api/admin-form-field-meta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_key: editingFormKey, intro: editorIntro, fields: editorFields }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Unable to save form.');
      setEditingFormKey(null);
    } catch (err) {
      setEditorError(err.message || 'Unable to save form.');
    } finally {
      setEditorSaving(false);
    }
  }

  async function toggle(formKey) {
    const current = gates[formKey];
    await save(formKey, !current?.is_open, drafts[formKey] ?? '');
  }

  async function saveMessage(formKey) {
    const current = gates[formKey];
    await save(formKey, current?.is_open !== false, drafts[formKey] ?? '');
  }

  async function save(formKey, isOpen, message) {
    setSavingKey(formKey);
    setError('');
    setStatus('');
    try {
      const response = await fetch('/api/admin-form-gates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_key: formKey, is_open: isOpen, message }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.gate?.form_key !== formKey) throw new Error(result?.error || 'Unable to confirm form status. Reload the page before trying again.');
      setGates((prev) => ({ ...prev, [formKey]: result.gate }));
      setStatus(`${LABELS[formKey]} ${isOpen ? 'opened' : 'closed'}.`);
    } catch (err) {
      setError(err.message || 'Unable to save form gate.');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <AdminShell
      title="Form Gates"
      subtitle="Open or close the member intake forms linked from /forms."
      onLogout={handleLogout}
    >
      {error && <p className="guide-message error" role="alert">{error}</p>}
      {status && <p className="guide-message success" role="status">{status}</p>}

      {loading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : (
        <Table>
          <thead><tr><th>Form</th><th>Status</th><th>Closed message</th><th /></tr></thead>
          <tbody>
            {ORDER.map((formKey) => {
              const gate = gates[formKey] || { is_open: true, message: '' };
              const isOpen = gate.is_open !== false;
              return (
                <tr key={formKey}>
                  <td>{LABELS[formKey]}</td>
                  <td>{isOpen ? 'Open' : 'Closed'}</td>
                  <td style={{ minWidth: 260 }}>
                    <Field label="">
                      <Input
                        tone="console"
                        placeholder="Optional message shown while closed"
                        value={drafts[formKey] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [formKey]: e.target.value }))}
                        onBlur={() => saveMessage(formKey)}
                      />
                    </Field>
                  </td>
                  <td className="admin-table-actions">
                    <Button
                      variant="quiet"
                      onClick={() => toggle(formKey)}
                      disabled={savingKey === formKey}
                    >
                      {savingKey === formKey ? 'Saving…' : isOpen ? 'Close form' : 'Open form'}
                    </Button>
                    <Button variant="quiet" onClick={() => openEditor(formKey)}>Edit Form</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {OTHER_FORM_KEYS.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Other forms</h2>
          <Table>
            <thead><tr><th>Form</th><th /></tr></thead>
            <tbody>
              {OTHER_FORM_KEYS.map((formKey) => (
                <tr key={formKey}>
                  <td>{FORM_META_TITLES[formKey]}</td>
                  <td className="admin-table-actions">
                    <Button variant="quiet" onClick={() => openEditor(formKey)}>Edit Form</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {editingFormKey && (
        <div className="admin-drawer-overlay" role="presentation" onClick={closeEditor}>
          <div className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="form-editor-title" onClick={(e) => e.stopPropagation()}>
            <div className="admin-drawer-header">
              <h2 id="form-editor-title">Edit {FORM_META_TITLES[editingFormKey] || LABELS[editingFormKey]}</h2>
              <button type="button" className="admin-drawer-close" onClick={closeEditor} aria-label="Close">&times;</button>
            </div>

            {editorError && <p className="guide-message error" role="alert">{editorError}</p>}

            {editorLoading ? (
              <p>Loading…</p>
            ) : (
              <>
                <div className="admin-drawer-section">
                  <h3>Intro copy</h3>
                  <Field label="Kicker (small label above the heading)">
                    <Input tone="console" value={editorIntro.kicker} onChange={(e) => setEditorIntro((i) => ({ ...i, kicker: e.target.value }))} maxLength={120} />
                  </Field>
                  <Field label="Heading">
                    <Input tone="console" value={editorIntro.heading} onChange={(e) => setEditorIntro((i) => ({ ...i, heading: e.target.value }))} maxLength={160} />
                  </Field>
                  <Field label="Description">
                    <Textarea tone="console" rows={3} value={editorIntro.description} onChange={(e) => setEditorIntro((i) => ({ ...i, description: e.target.value }))} maxLength={500} />
                  </Field>
                </div>

                {editorFields.length > 0 && (
                  <div className="admin-drawer-section">
                    <h3>Fields</h3>
                    {!FORM_FIELDS_REORDERABLE[editingFormKey] && (
                      <p className="hint">Field order here mirrors the live form and can&apos;t be changed.</p>
                    )}
                    {editorFields.map((field, index) => (
                      <div key={field.key} className="k-plate" style={{ padding: 14, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: 12, opacity: 0.7 }}>{field.key}</strong>
                          {FORM_FIELDS_REORDERABLE[editingFormKey] && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Button variant="quiet" onClick={() => moveEditorField(index, -1)} disabled={index === 0} aria-label={`Move ${field.key} up`}>↑</Button>
                              <Button variant="quiet" onClick={() => moveEditorField(index, 1)} disabled={index === editorFields.length - 1} aria-label={`Move ${field.key} down`}>↓</Button>
                            </div>
                          )}
                        </div>
                        <Field label="Label">
                          <Input tone="console" value={field.label} onChange={(e) => updateEditorField(index, 'label', e.target.value)} maxLength={120} />
                        </Field>
                        <Field label="Placeholder">
                          <Input tone="console" value={field.placeholder} onChange={(e) => updateEditorField(index, 'placeholder', e.target.value)} maxLength={160} />
                        </Field>
                        <Field label="Help text">
                          <Input tone="console" value={field.help_text} onChange={(e) => updateEditorField(index, 'help_text', e.target.value)} maxLength={300} />
                        </Field>
                      </div>
                    ))}
                  </div>
                )}

                <div className="admin-drawer-section" style={{ display: 'flex', gap: 10 }}>
                  <Button onClick={saveEditor} disabled={editorSaving}>{editorSaving ? 'Saving…' : 'Save'}</Button>
                  <Button variant="quiet" onClick={closeEditor} disabled={editorSaving}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
