'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import AdminDialog from '../../../../components/admin/AdminDialog';
import StatusChip from '../../../../components/admin/StatusChip';
import Switch from '../../../../components/admin/Switch';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { describeFormState, fromLocalInput, localZoneName, toLocalInput } from '../../../../components/admin/adminDates';
import { Button, Field, Input, Textarea } from '../../../../components/ui';
import { FORM_GATE_LABELS as LABELS, EVENT_GATE_KEYS } from '../../../../lib/formGates.mjs';
import { useEscapeToClose } from '../../../../lib/useEscapeToClose';
import { windowState } from '../../../../lib/deadlines.mjs';
import { FORM_META_KEYS, FORM_META_TITLES, FORM_FIELDS_REORDERABLE, DEFAULT_FORM_FIELDS } from '../../../../lib/formFieldMeta.mjs';

// Forms grouped by the event they belong to.
const GROUPS = [
  { id: 'kvk', title: 'KvK', keys: ['joiner', 'prep', 'appointments'] },
  { id: 'flamedragon', title: 'Flamedragon Tyrant', keys: ['dragon', 'noble'] },
  { id: 'standing', title: 'Standing', keys: ['lead', 'requests'] },
  { id: 'other', title: 'Other', keys: ['swordland', 'tri-alliance', 'castle-battle'] },
];
const GATE_KEYS = GROUPS.flatMap((g) => g.keys);
const TEXT_ONLY_KEYS = FORM_META_KEYS.filter((key) => !GATE_KEYS.includes(key));

export default function AdminFormGatesPage() {
  const [gates, setGates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [closing, setClosing] = useState(null);
  const [roundKey, setRoundKey] = useState(null);
  const [roundDraft, setRoundDraft] = useState({ label: '', clearWindow: true, clearMessage: false });
  const [settingsKey, setSettingsKey] = useState(null);
  const [settingsDraft, setSettingsDraft] = useState({ message: '', opens: '', closes: '' });
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [editingFormKey, setEditingFormKey] = useState(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [editorIntro, setEditorIntro] = useState({ kicker: '', heading: '', description: '' });
  const [editorFields, setEditorFields] = useState([]);
  const router = useRouter();
  const now = useMemo(() => Date.now(), [gates]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin-form-gates', { cache: 'no-store' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result?.gates)) throw new Error(result?.error || 'Unable to load forms. Please reload the page.');
      const byKey = {};
      for (const gate of result.gates || []) byKey[gate.form_key] = gate;
      setGates(byKey);
    } catch (err) {
      setError(err.message || 'Unable to load forms.');
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
  useEscapeToClose(Boolean(editingFormKey), closeEditor);

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

  async function patchGate(formKey, body) {
    const response = await fetch('/api/admin-form-gates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_key: formKey, ...body }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.gate?.form_key !== formKey) throw new Error(result?.error || 'Unable to confirm the change. Reload the page before trying again.');
    setGates((prev) => ({ ...prev, [formKey]: result.gate }));
    return result.gate;
  }

  async function setOpen(formKey, isOpen) {
    setSavingKey(formKey);
    setError('');
    setNotice('');
    try {
      await patchGate(formKey, { is_open: isOpen, message: gates[formKey]?.message || '' });
      setNotice(`${LABELS[formKey]} is now ${isOpen ? 'on' : 'off'}.`);
    } catch (err) {
      setError(err.message || 'Unable to save.');
    } finally {
      setSavingKey(null);
      setClosing(null);
    }
  }

  function openRound(formKey) {
    setRoundKey(formKey);
    setRoundDraft({ label: '', clearWindow: true, clearMessage: false });
  }

  async function startRound() {
    const formKey = roundKey;
    setSavingKey(formKey);
    setError('');
    setNotice('');
    try {
      const gate = await patchGate(formKey, {
        start_round: true,
        round_label: roundDraft.label,
        clear_window: roundDraft.clearWindow,
        clear_message: roundDraft.clearMessage,
      });
      setNotice(`${LABELS[formKey]}: new round started (${gate.round_label || 'new round'}). Members can vote again.`);
    } catch (err) {
      setError(err.message || 'Unable to start a new round.');
    } finally {
      setSavingKey(null);
      setRoundKey(null);
    }
  }

  function onSwitch(formKey, next) {
    if (next) setOpen(formKey, true);
    else setClosing(formKey);
  }

  function openSettings(formKey) {
    const gate = gates[formKey] || {};
    setSettingsKey(formKey);
    setSettingsDraft({ message: gate.message || '', opens: toLocalInput(gate.opens_at), closes: toLocalInput(gate.closes_at) });
    setSettingsError('');
    setSettingsSaved(false);
  }

  async function saveSettings(event) {
    event.preventDefault();
    const formKey = settingsKey;
    const hasWindow = EVENT_GATE_KEYS.includes(formKey);
    if (hasWindow && settingsDraft.opens && settingsDraft.closes && new Date(settingsDraft.closes) <= new Date(settingsDraft.opens)) {
      setSettingsError('Closes must be after Opens.');
      return;
    }
    setSavingKey(formKey);
    setSettingsError('');
    setSettingsSaved(false);
    try {
      const gate = gates[formKey] || {};
      await patchGate(formKey, {
        is_open: gate.is_open !== false,
        message: settingsDraft.message,
        ...(hasWindow ? { opens_at: fromLocalInput(settingsDraft.opens), closes_at: fromLocalInput(settingsDraft.closes) } : {}),
      });
      setSettingsSaved(true);
    } catch (err) {
      setSettingsError(err.message || 'Unable to save.');
    } finally {
      setSavingKey(null);
    }
  }

  function renderGateRow(formKey) {
    const gate = gates[formKey] || { is_open: true, message: '' };
    const isOn = gate.is_open !== false;
    const win = windowState(gate, now, { requireWindow: EVENT_GATE_KEYS.includes(formKey) });
    const chip = describeFormState(win.state, win.opensAt, win.closesAt, win.reason);
    return (
      <tr key={formKey}>
        <th scope="row" data-label="Form" className="ec-form-name">
          <span>{LABELS[formKey]}</span>
          {EVENT_GATE_KEYS.includes(formKey) ? (
            <span className="ff-message-none">Round: {gate.round_label || 'First round'}</span>
          ) : null}
        </th>
        <td data-label="State"><StatusChip kind={chip.kind}>{chip.text}</StatusChip></td>
        <td data-label="Switch">
          <Switch
            checked={isOn}
            label={`${LABELS[formKey]}: ${isOn ? 'on, switch off' : 'off, switch on'}`}
            onChange={(next) => onSwitch(formKey, next)}
            disabled={savingKey === formKey}
          />
        </td>
        <td data-label="Closed message" className="ff-message">
          {gate.message ? <span className="ff-message-text" title={gate.message}>{gate.message}</span> : <span className="ff-message-none">None</span>}
        </td>
        <td data-label="Actions" className="ff-actions">
          <Button variant="quiet" className="ec-btn-sm" onClick={() => openSettings(formKey)} aria-label={`Message and times for ${LABELS[formKey]}`}>
            {gate.message ? 'Message & times' : EVENT_GATE_KEYS.includes(formKey) ? 'Times & message' : 'Add message'}
          </Button>
          <Button variant="quiet" className="ec-btn-sm" onClick={() => openEditor(formKey)} aria-label={`Edit text of ${LABELS[formKey]}`}>Edit form text</Button>
          {EVENT_GATE_KEYS.includes(formKey) ? (
            <Button variant="quiet" className="ec-btn-sm" onClick={() => openRound(formKey)} aria-label={`Start a new round of ${LABELS[formKey]}`}>Start a new round</Button>
          ) : null}
        </td>
      </tr>
    );
  }

  const settingsHasWindow = settingsKey ? EVENT_GATE_KEYS.includes(settingsKey) : false;

  return (
    <AdminShell
      title="Forms & copy"
      subtitle="Switch member forms on or off, set the message people see while a form is closed, and edit form wording."
      onLogout={handleLogout}
    >
      <div className="ec-live" role="status" aria-live="polite">{notice ? <p className="ec-notice">{'\u2713 '}{notice}</p> : null}</div>
      {error && <p className="ec-inline-error" role="alert">{error}</p>}

      {loading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : (
        <div className="ff-groups">
          {GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`ff-${group.id}`} className="ff-group">
              <h2 id={`ff-${group.id}`} className="ec-h2">{group.title}</h2>
              <div className="admin-table-wrap">
                <table className="admin-table ff-table">
                  <thead>
                    <tr>
                      <th scope="col">Form</th>
                      <th scope="col">State</th>
                      <th scope="col">Switch</th>
                      <th scope="col">Closed message</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.keys.map((formKey) => renderGateRow(formKey))}
                    {group.id === 'other' && TEXT_ONLY_KEYS.map((formKey) => (
                      <tr key={formKey}>
                        <th scope="row" data-label="Form" className="ec-form-name">{FORM_META_TITLES[formKey]}</th>
                        <td data-label="State"><span className="ff-message-none">Always available</span></td>
                        <td data-label="Switch"><span className="ff-message-none">-</span></td>
                        <td data-label="Closed message"><span className="ff-message-none">-</span></td>
                        <td data-label="Actions" className="ff-actions">
                          <Button variant="quiet" className="ec-btn-sm" onClick={() => openEditor(formKey)} aria-label={`Edit text of ${FORM_META_TITLES[formKey]}`}>Edit form text</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <AdminDialog
        open={Boolean(closing)}
        title={closing ? `Switch off ${LABELS[closing]}?` : ''}
        onClose={() => setClosing(null)}
        role="alertdialog"
        busy={Boolean(savingKey)}
        footer={(
          <>
            <Button variant="quiet" onClick={() => setClosing(null)}>Cancel</Button>
            <Button className="ec-btn-danger" onClick={() => setOpen(closing, false)} disabled={Boolean(savingKey)}>{savingKey ? 'Working...' : 'Switch off'}</Button>
          </>
        )}
      >
        <p className="ec-confirm-line">Members will see the closed message instead of this form. Answers already sent are kept. You can switch it on again at any time.</p>
      </AdminDialog>

      <AdminDialog
        open={Boolean(roundKey)}
        title={roundKey ? `Start a new round of ${LABELS[roundKey]}?` : ''}
        onClose={() => setRoundKey(null)}
        role="alertdialog"
        busy={Boolean(savingKey)}
        footer={(
          <>
            <Button variant="quiet" onClick={() => setRoundKey(null)}>Cancel</Button>
            <Button onClick={startRound} disabled={Boolean(savingKey)}>{savingKey ? 'Working...' : 'Start new round'}</Button>
          </>
        )}
      >
        <p className="ec-confirm-line">Members will have to vote again. Old votes are kept.</p>
        <div className="ec-form">
          <Field label="Round name (optional)" hint="Shown to members, e.g. Round of 20 October." htmlFor="ff-round-label">
            <Input tone="console" id="ff-round-label" data-autofocus maxLength={60} value={roundDraft.label} onChange={(e) => setRoundDraft((d) => ({ ...d, label: e.target.value }))} />
          </Field>
          <label className="ec-check">
            <input type="checkbox" checked={roundDraft.clearWindow} onChange={(e) => setRoundDraft((d) => ({ ...d, clearWindow: e.target.checked }))} />
            <span>Clear the open and close times</span>
          </label>
          <label className="ec-check">
            <input type="checkbox" checked={roundDraft.clearMessage} onChange={(e) => setRoundDraft((d) => ({ ...d, clearMessage: e.target.checked }))} />
            <span>Clear the closed message</span>
          </label>
        </div>
      </AdminDialog>

      <AdminDialog
        open={Boolean(settingsKey)}
        variant="drawer"
        title={settingsKey ? `${LABELS[settingsKey]}: message${settingsHasWindow ? ' and times' : ''}` : ''}
        onClose={() => setSettingsKey(null)}
        busy={Boolean(savingKey)}
        footer={(
          <>
            <Button variant="quiet" onClick={() => setSettingsKey(null)}>Close</Button>
            <Button type="submit" form="ff-settings-form" disabled={Boolean(savingKey)}>{savingKey ? 'Saving...' : 'Save'}</Button>
          </>
        )}
      >
        <form id="ff-settings-form" className="ec-form" onSubmit={saveSettings}>
          {settingsError ? <p className="ec-inline-error" role="alert">{settingsError}</p> : null}
          {settingsSaved ? <p className="ec-notice" role="status">{'\u2713 '}Saved</p> : null}
          <Field label="Message shown while the form is closed" hint="Optional. Leave empty to show the default wording." htmlFor="ff-message">
            <Textarea
              tone="console"
              id="ff-message"
              data-autofocus
              rows={4}
              maxLength={500}
              value={settingsDraft.message}
              onChange={(e) => { setSettingsDraft((d) => ({ ...d, message: e.target.value })); setSettingsSaved(false); }}
            />
          </Field>
          {settingsHasWindow ? (
            <>
              <Field label="Opens" htmlFor="ff-opens">
                <Input tone="console" id="ff-opens" type="datetime-local" value={settingsDraft.opens} onChange={(e) => { setSettingsDraft((d) => ({ ...d, opens: e.target.value })); setSettingsSaved(false); }} />
              </Field>
              <Field label="Closes" htmlFor="ff-closes">
                <Input tone="console" id="ff-closes" type="datetime-local" value={settingsDraft.closes} onChange={(e) => { setSettingsDraft((d) => ({ ...d, closes: e.target.value })); setSettingsSaved(false); }} />
              </Field>
              <p className="ec-hint">Times are in your local time ({localZoneName()}) and saved in UTC.</p>
            </>
          ) : null}
        </form>
      </AdminDialog>

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
