'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '../ui/icons';
import { TOOL_ICON } from '../../lib/toolHubTools.mjs';
import DriveStatusBanner from './DriveStatusBanner';
import ImageUploadField from './ImageUploadField';
import ConfirmDialog from './ConfirmDialog';
import styles from './ToolImagesEditor.module.css';

const TOOL_IMAGE_HINT = 'Square, at least 256x256; PNG, JPG or WebP; up to 4 MB.';

function ToolRow({ tool, driveReady, onSaved, onReset }) {
  const saved = tool.image;
  const [draft, setDraft] = useState(null); // { id, url, alt } uploaded but not saved yet
  const [alt, setAlt] = useState(saved?.alt || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const shown = draft || saved;
  const dirty = Boolean(draft) || (saved && alt.trim() !== (saved.alt || ''));
  const slug = `tool-${tool.key}`;

  function onImage(image) {
    setMessage(''); setError('');
    if (image) { setDraft(image); setAlt(image.alt || alt); return; }
    if (draft) { setDraft(null); setAlt(saved?.alt || ''); return; }
    onReset(tool); // Remove on a saved image = reset to default (confirmed)
  }

  async function save() {
    setError(''); setMessage('');
    if (!alt.trim()) { setError('Add an image description (alt text) first.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/admin-tool-images', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool_key: tool.key, site_image_id: (draft || saved).id, alt: alt.trim() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The image could not be saved.');
      setDraft(null); setMessage('Saved. Members see it on the Tools page within about 30 seconds.');
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <li className={styles.card} aria-labelledby={`${slug}-name`}>
      <div className={styles.head}>
        <div className={`${styles.thumb}${shown ? '' : ` ${styles.thumbIcon}`}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shown ? <img src={shown.url} alt="" width={64} height={64} /> : <Icon name={TOOL_ICON[tool.key] || 'gear'} size={28} />}
        </div>
        <div className={styles.name}>
          <strong id={`${slug}-name`}>{tool.title}</strong>
          <span>{tool.category}</span>
        </div>
        <span className={`${styles.badge}${saved ? ` ${styles.custom}` : ''}`}>{saved ? 'Custom' : 'Default'}</span>
      </div>
      <ImageUploadField
        key={`${tool.key}-${saved?.id || 'none'}`}
        folder="tool" label="Tile image" maxMb={4} value={shown} onChange={onImage} onAltChange={setAlt}
        disabled={!driveReady || busy}
      />
      <p className={styles.hint}>{TOOL_IMAGE_HINT} Shown at 64 px on the tile, so keep the subject centred.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.save} disabled={!dirty || busy || !driveReady} onClick={save}>{busy ? 'Saving…' : 'Save image'}</button>
        {saved ? <button type="button" className={styles.reset} disabled={busy} onClick={() => onReset(tool)}>Reset to default</button> : null}
        {dirty ? <span className={styles.pending}>Not saved yet</span> : null}
      </div>
      {message ? <p className={styles.ok} role="status">{message}</p> : null}
      {error ? <p className={styles.err} role="alert">{error}</p> : null}
    </li>
  );
}

export default function ToolImagesEditor() {
  const [tools, setTools] = useState(null);
  const [error, setError] = useState('');
  const [drive, setDrive] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin-tool-images', { cache: 'no-store' });
      if (response.status === 401) { setError('Your admin session expired. Sign in again.'); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setTools(body.tools); setError('');
    } catch { setError('The tool list could not be loaded. Reload the page to try again.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch('/api/admin-drive/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setDrive).catch(() => setDrive(null)); }, []);

  async function doReset() {
    setResetting(true);
    try {
      const response = await fetch('/api/admin-tool-images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool_key: confirm.key }) });
      if (!response.ok) throw new Error();
      setConfirm(null); await load();
    } catch { setError('The image could not be reset. Try again.'); setConfirm(null); } finally { setResetting(false); }
  }

  const driveReady = drive ? Boolean(drive.connected) : true;
  return (
    <section className={styles.wrap}>
      <p className={styles.intro}>Replace the icon on a Tools &amp; Calculators tile with your own picture. Pictures are stored in the Google Drive folder “Tools and calculators images”. Tools without a custom picture keep their built-in icon, and a missing or broken picture falls back to it automatically.</p>
      <DriveStatusBanner />
      {!driveReady ? <p className={styles.err} role="status">Uploads are turned off until Google Drive is connected. You can still reset pictures.</p> : null}
      {error ? <p className={styles.err} role="alert">{error}</p> : null}
      {!tools && !error ? <p className={styles.intro} role="status">Loading tools…</p> : null}
      {tools ? <ul className={styles.list}>{tools.map((t) => <ToolRow key={t.key} tool={t} driveReady={driveReady} onSaved={load} onReset={setConfirm} />)}</ul> : null}
      <ConfirmDialog open={Boolean(confirm)} title="Reset to the default icon?" message={confirm ? `${confirm.title} goes back to its built-in icon. The uploaded picture stays in Google Drive.` : ''} confirmLabel={resetting ? 'Resetting…' : 'Reset to default'} onConfirm={doReset} onCancel={() => { if (!resetting) setConfirm(null); }} />
    </section>
  );
}
