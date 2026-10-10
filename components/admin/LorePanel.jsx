'use client';

import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import DriveStatusBanner from './DriveStatusBanner';
import ImageUploadField from './ImageUploadField';
import { loadDriveStatus } from './AddImageButtons';
import StatusBadge from './StatusBadge';
import Switch from './Switch';
import TableSkeleton from './TableSkeleton';
import { Button, Field, Input, Table, Textarea } from '../ui';
import {
  LORE_ALT_MAX, LORE_BODY_MAX, LORE_IMAGE_MAX_BYTES, LORE_IMAGE_MAX_SIDE, LORE_IMAGE_MIN_SIDE, LORE_TITLE_MAX, nextStoryNumber, normalizeLoreBody,
} from '../../lib/lore.mjs';
import styles from './LorePanel.module.css';

const RESIZE = { maxSide: LORE_IMAGE_MAX_SIDE, minSide: LORE_IMAGE_MIN_SIDE, maxBytes: LORE_IMAGE_MAX_BYTES };
const EMPTY = { number: '', title: '', body: '', published: true, image_id: '', image_alt: '' };

export default function LorePanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  // null = list; 'new' = new story; a number = editing that story
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmRow, setConfirmRow] = useState(null);
  const [driveReady, setDriveReady] = useState(false);
  const liveImageId = useRef(''); // the photo that is actually saved; any other id in the form is an unsaved upload
  const errorRef = useRef(null);
  useEffect(() => { loadDriveStatus().then((s) => setDriveReady(Boolean(s?.connected))); }, []);

  function dropUnsavedPhoto(id) {
    if (id && id !== liveImageId.current) fetch(`/api/admin-drive/images?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }
  function changePhoto(image) {
    if (form.image_id && form.image_id !== image?.id) dropUnsavedPhoto(form.image_id);
    setForm((f) => ({ ...f, image_id: image?.id || '', ...(image ? {} : { image_alt: '' }) }));
  }

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin-lore', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load stories.');
      setRows(result.stories || []);
    } catch (err) {
      setError(err.message || 'Unable to load stories.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setError(''); setStatus('');
    liveImageId.current = '';
    setForm({ ...EMPTY, number: String(nextStoryNumber(rows)) });
    setEditing('new');
  }
  function openEdit(row) {
    setError(''); setStatus('');
    liveImageId.current = row.image_id || '';
    setForm({ number: String(row.number), title: row.title || '', body: row.body || '', published: row.published !== false, image_id: row.image_id || '', image_alt: row.image_alt || '' });
    setEditing(row.number);
  }
  function closeEdit() {
    if (saving) return;
    dropUnsavedPhoto(form.image_id);
    setEditing(null); setForm(EMPTY); setError('');
  }

  async function save() {
    setSaving(true); setError(''); setStatus('');
    try {
      const isNew = editing === 'new';
      const response = await fetch(isNew ? '/api/admin-lore' : `/api/admin-lore/${editing}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, number: form.number.trim() === '' ? null : Number(form.number) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to save the story.');
      setStatus(result.warning || (isNew ? `Story ${result.story.number} created.` : `Story ${result.story.number} saved.`));
      setEditing(null); setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err.message || 'Unable to save the story.');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!confirmRow) return;
    try {
      const response = await fetch(`/api/admin-lore/${confirmRow.number}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to delete the story.');
      setStatus(`Story ${confirmRow.number} deleted.`); setConfirmRow(null);
      await load();
    } catch (err) {
      setError(err.message || 'Unable to delete the story.'); setConfirmRow(null);
    }
  }

  const bodyLength = normalizeLoreBody(form.body).length;
  const canSave = !saving && form.title.trim() && bodyLength > 0 && bodyLength <= LORE_BODY_MAX && /^\d{1,4}$/.test(form.number.trim());

  if (editing !== null) {
    const isNew = editing === 'new';
    return (
      <div className={styles.editor}>
        <h2 className={styles.editorTitle}>{isNew ? 'New story' : `Edit story ${editing}`}</h2>
        {error && <p className="guide-message error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
        <div className={styles.top}>
          <Field label="Story number" htmlFor="lore-number" hint="Story 1 shows first on the page.">
            <Input id="lore-number" tone="console" type="number" inputMode="numeric" min={1} max={9999} value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
          </Field>
          <Field label="Title" htmlFor="lore-title">
            <Input id="lore-title" tone="console" maxLength={LORE_TITLE_MAX} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
        </div>
        <Field label="Story text" htmlFor="lore-body" hint="Plain text. A blank line starts a new paragraph; single line breaks are kept, so dialogue lines stay on their own line. No hashtags or @names needed.">
          <Textarea id="lore-body" tone="console" rows={14} className={styles.body} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          <span className={`${styles.count}${bodyLength > LORE_BODY_MAX ? ` ${styles.over}` : ''}`} aria-live="polite">{bodyLength} / {LORE_BODY_MAX} characters</span>
        </Field>
        <div className={styles.photo}>
          <DriveStatusBanner />
          <ImageUploadField
            key={String(editing)}
            folder="lore" label="Photo (optional)" altRequired={false} resizeMax={RESIZE} removeLabel="Remove photo"
            disabled={!driveReady || saving} value={form.image_id ? { id: form.image_id, url: `/api/site-image/${form.image_id}`, alt: form.image_alt } : null}
            onChange={changePhoto} onAltChange={(text) => setForm((f) => ({ ...f, image_alt: text.slice(0, LORE_ALT_MAX) }))}
            hint={`One picture per story, landscape or portrait. It is shrunk in your browser to at most ${LORE_IMAGE_MAX_SIDE} pixels on its longer side and keeps its shape. Describe it for people using screen readers; if you leave the description empty the story title is used.`}
          />
        </div>
        <div className={styles.publish}>
          <Switch checked={form.published} onChange={(published) => setForm((f) => ({ ...f, published }))} label="Published" onText="Published (visible on the site)" offText="Draft (hidden from the site)" disabled={saving} />
        </div>
        <div className={styles.bar}>
          <Button onClick={save} disabled={!canSave}>{saving ? 'Saving…' : isNew ? 'Create story' : 'Save story'}</Button>
          <Button variant="quiet" onClick={closeEdit} disabled={saving}>Cancel</Button>
          <span className={styles.barNote}>{form.published ? 'Will be public' : 'Draft, hidden'}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="admin-page-lead">The stories on the public Lore page, oldest first. The page is English only and is not translated.</p>
      {error && <p className="guide-message error" role="alert">{error}</p>}
      {status && <p className="guide-message success" role="status">{status}</p>}
      <div style={{ margin: '16px 0' }}>
        <Button onClick={openCreate}>+ New story</Button>
      </div>
      {loading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : rows.length === 0 ? (
        <p>No stories yet. Add the first one.</p>
      ) : (
        <Table className="stack-table">
          <thead><tr><th>#</th><th>Title</th><th>Status</th><th>Photo</th><th /></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.number}>
                <td>{row.number}</td>
                <td>{row.title}</td>
                <td><StatusBadge status={row.published !== false ? 'normal' : 'pending'} label={row.published !== false ? 'Published' : 'Draft'} /></td>
                <td>{row.image_id ? 'Yes' : 'No'}</td>
                <td className="admin-table-actions">
                  <Button variant="quiet" onClick={() => openEdit(row)}>Edit</Button>
                  <Button variant="quiet" onClick={() => setConfirmRow(row)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ConfirmDialog
        open={Boolean(confirmRow)}
        title="Delete this story?"
        message={confirmRow ? `Story ${confirmRow.number}, "${confirmRow.title}", will be permanently removed${confirmRow.image_id ? ' together with its photo' : ''}.` : ''}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmRow(null)}
      />
    </div>
  );
}
