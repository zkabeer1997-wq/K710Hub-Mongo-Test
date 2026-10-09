'use client';

import { useId, useState } from 'react';
import AddImageButtons from './AddImageButtons';
import { cropToAspectFile, cropToSquareFile, CropError } from './cropSquare';
import styles from './ImageUploadField.module.css';

/**
 * Shared admin image field: the two AddImageButtons ("Upload Image" +
 * "Choose from Drive"), preview, replace, remove, progress and plain-language errors. Images
 * are stored in Google Drive (K710 Website/<folder>) by POST /api/admin-drive/images;
 * the value is a same-origin URL (/api/site-image/<id>), safe to save in your
 * own record.
 *
 * Props
 *  - folder        'hero' | 'tool'          which Drive folder (required)
 *  - value         { id?, url, alt? } | null  current image
 *  - onChange      (image | null) => void   called after upload/pick (image = {id,url,alt,name,width,height,...}) or remove
 *  - label         visible label (default "Image")
 *  - altRequired   require a description (default true; accessibility)
 *  - subfolder     optional Drive subfolder name (letters, numbers, spaces, - _)
 *  - deleteOnRemove  also move the Drive file to the Drive trash on Remove (default false: only clears)
 *  - endpoint      override the save endpoint (same JSON/multipart contract)
 *  - maxMb         client-side size check (default 8, server enforces)
 *  - onAltChange   (text) => void   called as the description is edited (optional)
 *  - cropSquare    number: crop to a centred square of this many pixels in the browser BEFORE saving (uploads), and
 *                  re-crop Drive picks after they are copied; the preview then shows the square crop
 *  - cropAspect   { width, height, minWidth, minHeight, maxBytes, tooSmall }: crop to a centred rectangle of that aspect and
 *                  resize to width x height in the browser (alliance photos, 16:9). Same flow as cropSquare, wide preview
 *  - removeLabel  text of the remove button (default "Remove image")
 *  - showAlt      false hides the description box (decorative images)
 *  - hint          replaces the default help line under the buttons
 *  - disabled
 */
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function postForm(endpoint, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(new Error('The upload could not reach the server. Check your connection and try again.'));
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* keep empty */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.image) resolve(body.image);
      else if (xhr.status === 401) reject(new Error('Your admin session expired. Sign in again, then retry.'));
      else reject(new Error(body.error || 'The image could not be saved. Please try again.'));
    };
    xhr.send(form);
  });
}

export default function ImageUploadField({ onAltChange, folder, value = null, onChange, label = 'Image', altRequired = true, subfolder, deleteOnRemove = false, endpoint = '/api/admin-drive/images', maxMb = 8, disabled = false, cropSquare = 0, cropAspect = null, removeLabel = 'Remove image', hint = '', showAlt = true }) {
  const id = useId();
  const [alt, setAlt] = useState(value?.alt || '');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const crops = Boolean(cropSquare || cropAspect);
  const prepare = (blob, name) => (cropAspect ? cropToAspectFile(blob, { ...cropAspect, name }) : cropToSquareFile(blob, { size: cropSquare, name }));

  function needAlt() {
    if (altRequired && !alt.trim()) { setError('Describe the image first (for people using screen readers).'); return true; }
    return false;
  }

  async function uploadFile(files) {
    const file = files?.[0];
    if (!file) return;
    setError('');
    if (!TYPES.includes(file.type)) { setError(`"${file.name}" is not a JPG, PNG, WebP or GIF image.`); return; }
    if (file.size > maxMb * 1024 * 1024) { setError(`"${file.name}" is larger than ${maxMb} MB. Resize it and try again.`); return; }
    if (needAlt()) return;
    setBusy(true); setProgress(0);
    let sendFile = file;
    if (crops) {
      try { sendFile = await prepare(file, file.name); }
      catch (e) { setError(e instanceof CropError ? e.message : 'The picture could not be prepared. Try a different image.'); setBusy(false); return; }
    }
    const form = new FormData();
    form.append('file', sendFile); form.append('folder', folder); form.append('alt', alt.trim());
    if (subfolder) form.append('subfolder', subfolder);
    try { onChange?.(await postForm(endpoint, form, setProgress)); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function pickFromDrive(files) {
    const picked = files?.[0];
    if (!picked) return;
    setError('');
    if (needAlt()) return;
    setBusy(true); setProgress(0);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder, driveFileId: picked.id, alt: alt.trim(), ...(subfolder ? { subfolder } : {}) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'That file could not be copied from Google Drive.');
      onChange?.(crops ? await recropPicked(body.image) : body.image);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  // A Drive pick is copied as-is; crop the copy in the browser too, replace it, and drop the raw copy.
  // If anything fails the raw copy stays (the page still shows it with object-fit: cover).
  async function recropPicked(image) {
    try {
      const raw = await fetch(image.url, { cache: 'no-store' });
      if (!raw.ok) return image;
      const file = await prepare(await raw.blob(), image.name);
      const form = new FormData();
      form.append('file', file); form.append('folder', folder); form.append('alt', alt.trim());
      if (subfolder) form.append('subfolder', subfolder);
      const cropped = await postForm(endpoint, form, setProgress);
      try { await fetch(`${endpoint}?id=${encodeURIComponent(image.id)}`, { method: 'DELETE' }); } catch { /* orphan raw copy is harmless */ }
      return cropped;
    } catch (e) {
      if (e instanceof CropError) setError(`${e.message} The original was kept and is trimmed to fit on the page.`);
      return image;
    }
  }

  async function remove() {
    setError('');
    if (deleteOnRemove && value?.id) {
      try { await fetch(`${endpoint}?id=${encodeURIComponent(value.id)}`, { method: 'DELETE' }); } catch { /* clearing is what matters */ }
    }
    onChange?.(null);
  }

  return (
    <div className={styles.field}>
      <span className={styles.label} id={`${id}-label`}>{label}</span>
      <div className={styles.row}>
        <div className={`${styles.preview}${cropAspect ? ` ${styles.previewWide}` : cropSquare ? ` ${styles.previewSquare}` : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value?.url ? <img src={value.url} alt={value.alt || alt || ''} /> : <span>No image yet</span>}
        </div>
        <div className={styles.field}>
          {showAlt ? <div className={styles.alt}>
            <label htmlFor={`${id}-alt`}>Image description{altRequired ? ' (required)' : ''}</label>
            <input id={`${id}-alt`} value={alt} maxLength={240} disabled={disabled || busy} onChange={(e) => { setAlt(e.target.value); onAltChange?.(e.target.value); }} aria-describedby={error ? `${id}-err` : undefined} />
          </div> : null}
          <AddImageButtons onFiles={uploadFile} onPick={pickFromDrive} onError={setError} busy={busy} progress={progress} disabled={disabled} />
          {value?.url ? <div className={styles.actions}><button type="button" className={`${styles.btn} ${styles.danger}`} disabled={busy || (disabled && deleteOnRemove)} onClick={remove}>{removeLabel}</button></div> : null}
          <p className={styles.hint}>{hint || `JPG, PNG, WebP or GIF, up to ${maxMb} MB. Saved to Google Drive, not the database.`}</p>
          {error ? <p className={styles.error} id={`${id}-err`} role="alert">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
