'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import SectionTabs, { TOOL_TABS } from '../../../../components/admin/SectionTabs';
import { Button, Field, Input, Select } from '../../../../components/ui';
import { validateToolQuantities, defaultQuantities } from '../../../../lib/toolCatalog.mjs';

export default function ToolEditingPage() {
  const router = useRouter();
  const [tools, setTools] = useState([]);
  const [selected, setSelected] = useState('');
  const [values, setValues] = useState({});
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');

  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  useEffect(() => {
    fetch('/api/admin-tool-settings', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        setTools(data.tools);
        setSelected(data.tools[0]?.key || '');
        setValues(data.tools[0]?.quantities || {});
      })
      .catch((err) => setStatus(err.message));
  }, []);

  const tool = tools.find((t) => t.key === selected);

  function choose(key) {
    setSelected(key);
    setValues(tools.find((t) => t.key === key)?.quantities || {});
    setDirty(false);
    setStatus('');
    setQuery('');
  }

  async function save() {
    const { quantities, error } = validateToolQuantities(selected, values);
    if (error) {
      setStatus(error);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/admin-tool-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: selected, quantities }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setTools((prev) => prev.map((t) => (t.key === selected ? { ...t, quantities: data.quantities } : t)));
      setDirty(false);
      setStatus('Saved. Members will use these quantities when they open or reload the tool.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setSaving(false);
    }
  }

  function setField(key, raw) {
    setValues((prev) => ({ ...prev, [key]: raw === '' ? '' : Number(raw) }));
    setDirty(true);
  }

  const fields = tool?.fields.filter((f) => `${f.group} ${f.label}`.toLowerCase().includes(query.toLowerCase())) || [];
  const groups = [...new Set(fields.map((f) => f.group))];

  return (
    <AdminShell onLogout={logout} title="Tools" subtitle="Update item quantities used by the pack calculators">
      <SectionTabs tabs={TOOL_TABS} label="Tools sections" />
      <p className="tool-edit-note">
        Pack prices, merge chances, purchase rules, and calculation methods stay fixed. Changes apply to the selected tool.
      </p>
      <div className="tool-edit-toolbar">
        <Field label="Tool" htmlFor="tool-edit-tool">
          <Select id="tool-edit-tool" tone="console" value={selected} disabled={saving || dirty} onChange={(e) => choose(e.target.value)}>
            {tools.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Find an item" htmlFor="tool-edit-find">
          <Input id="tool-edit-find" tone="console" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Item, pack, or charm level" />
        </Field>
      </div>
      <div aria-live="polite">
        {status && <p className="tool-edit-status" role="status">{status}</p>}
        {dirty && <p className="tool-edit-status">Unsaved changes. Save or discard before changing tools.</p>}
      </div>
      <div className="tool-edit-actions">
        <Button onClick={save} disabled={!tool || saving || !dirty}>{saving ? 'Saving...' : 'Save quantities'}</Button>
        <Button variant="quiet" disabled={!dirty || saving} onClick={() => choose(selected)}>Discard changes</Button>
        <Button
          variant="quiet"
          disabled={!tool || saving}
          onClick={() => {
            setValues(defaultQuantities(selected));
            setDirty(true);
            setStatus('Defaults restored in the editor. Save to apply.');
          }}
        >
          Restore defaults
        </Button>
      </div>
      <fieldset disabled={saving} className="tool-edit-grid">
        <legend className="sr-only">Quantities</legend>
        {groups.map((group) => (
          <section className="tool-edit-card" key={group}>
            <h2>{group}</h2>
            {fields.filter((f) => f.group === group).map((f) => (
              <label key={f.key} className="tool-edit-row">
                <span>{f.label}</span>
                <input
                  className="k-input"
                  aria-label={`${group}: ${f.label}`}
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              </label>
            ))}
          </section>
        ))}
      </fieldset>
    </AdminShell>
  );
}
