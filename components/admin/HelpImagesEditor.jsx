'use client';

import { useCallback, useEffect, useState } from 'react';
import DriveStatusBanner from './DriveStatusBanner';
import ImageUploadField from './ImageUploadField';
import ConfirmDialog from './ConfirmDialog';
import { HELP_ALT_EXPLANATION, HELP_IMAGE_SIDES } from '../../lib/helpImages.mjs';
import styles from './HelpImagesEditor.module.css';

const SIDE_LABEL = { right: 'Right of the text', left: 'Left of the text' };

function SectionRow({ section, number, driveReady, onSaved, onRemove }) {
  const saved = section.image;
  const [draft, setDraft] = useState(null); // uploaded or picked, not saved yet
  const [alt, setAlt] = useState(saved?.alt || '');
  const [caption, setCaption] = useState(saved?.caption || '');
  const [side, setSide] = useState(saved?.side || 'right');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const shown = draft || saved;
  const dirty = Boolean(draft) || (saved && (alt.trim() !== (saved.alt || '') || caption.trim() !== (saved.caption || '') || side !== saved.side));

  function onImage(image) {
    setMessage(''); setError('');
    if (image) { setDraft(image); setAlt(image.alt || alt); return; }
    if (draft) { setDraft(null); setAlt(saved?.alt || ''); return; }
    onRemove(section); // Remove on a saved image is confirmed
  }

  async function save() {
    setError(''); setMessage('');
    if (!alt.trim()) { setError('Add an image description (alt text) first.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/admin-help-images', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section_id: section.id, site_image_id: (draft || saved).id, alt: alt.trim(), caption: caption.trim(), side }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The image could not be saved.');
      setDraft(null); setMessage('Saved. Visitors see it on the Help page within about 30 seconds.');
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <li className={styles.card} aria-labelledby={`help-${section.id}-name`}>
      <div className={styles.head}>
        <span className={styles.num} aria-hidden="true">{number}</span>
        <div className={styles.name}>
          <strong id={`help-${section.id}-name`}>{section.title}</strong>
          <a href={`/help#${section.id}`} target="_blank" rel="noopener noreferrer">View on the Help page</a>
        </div>
        <span className={`${styles.badge}${saved ? ` ${styles.custom}` : ''}`}>{saved ? 'Has image' : 'Text only'}</span>
      </div>
      <ImageUploadField
        key={`${section.id}-${saved?.id || 'none'}`}
        folder="help" label="Picture" maxMb={6} value={shown} onChange={onImage} onAltChange={setAlt}
        disabled={!driveReady || busy}
      />
      <p className={styles.hint}>{HELP_ALT_EXPLANATION}</p>
      {shown ? (
        <>
          <div className={styles.field}>
            <label htmlFor={`help-${section.id}-cap`}>Caption (optional)</label>
            <input id={`help-${section.id}-cap`} value={caption} maxLength={300} disabled={busy} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <fieldset className={styles.side} disabled={busy}>
            <legend>Picture position</legend>
            {HELP_IMAGE_SIDES.map((value) => (
              <label key={value} className={styles.radio}>
                <input type="radio" name={`help-${section.id}-side`} value={value} checked={side === value} onChange={() => setSide(value)} />
                <span>{value === 'right' ? 'Right' : 'Left'}</span>
              </label>
            ))}
            <small>{SIDE_LABEL[side]} on wide screens. On phones the picture sits under the heading.</small>
          </fieldset>
        </>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.save} disabled={!dirty || busy || !driveReady} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        {dirty ? <span className={styles.pending}>Not saved yet</span> : null}
      </div>
      {message ? <p className={styles.ok} role="status">{message}</p> : null}
      {error ? <p className={styles.err} role="alert">{error}</p> : null}
    </li>
  );
}

export default function HelpImagesEditor() {
  const [sections, setSections] = useState(null);
  const [error, setError] = useState('');
  const [drive, setDrive] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin-help-images', { cache: 'no-store' });
      if (response.status === 401) { setError('Your admin session expired. Sign in again.'); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSections(body.sections); setError('');
    } catch { setError('The help sections could not be loaded. Reload the page to try again.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch('/api/admin-drive/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setDrive).catch(() => setDrive(null)); }, []);

  async function doRemove() {
    setRemoving(true);
    try {
      const response = await fetch('/api/admin-help-images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section_id: confirm.id }) });
      if (!response.ok) throw new Error();
      // The Drive file goes to the Drive trash (recoverable) and its record is dropped.
      if (confirm.image?.id) { try { await fetch(`/api/admin-drive/images?id=${encodeURIComponent(confirm.image.id)}`, { method: 'DELETE' }); } catch { /* the link is already gone */ } }
      setConfirm(null); await load();
    } catch { setError('The image could not be removed. Try again.'); setConfirm(null); } finally { setRemoving(false); }
  }

  const driveReady = drive ? Boolean(drive.connected) : true;
  return (
    <section className={styles.wrap}>
      <p className={styles.intro}>Add one picture next to any section of the public Help page. Pictures are stored in Google Drive (K710 Website, Help images). Sections without a picture stay text only.</p>
      <DriveStatusBanner />
      {error ? <p className={styles.err} role="alert">{error}</p> : null}
      {!sections && !error ? <p className={styles.intro} role="status">Loading sections…</p> : null}
      {sections ? <ol className={styles.list}>{sections.map((s, i) => <SectionRow key={s.id} section={s} number={i + 1} driveReady={driveReady} onSaved={load} onRemove={setConfirm} />)}</ol> : null}
      <ConfirmDialog
        open={Boolean(confirm)} title="Remove this image?"
        message={confirm ? `The picture next to “${confirm.title}” will be removed from the Help page. The file moves to the Google Drive trash, so it can be recovered there.` : ''}
        confirmLabel={removing ? 'Removing…' : 'Remove image'} onConfirm={doRemove} onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
