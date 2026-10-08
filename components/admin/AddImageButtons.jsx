'use client';

import { useEffect, useId, useRef, useState } from 'react';
import DriveImagePicker from './DriveImagePicker';
import AdminDialog from './AdminDialog';
import { PICKER_SETUP_STEPS } from '../../lib/pickerConfig.mjs';
import { ADD_IMAGE_HELP, DRIVE_IMAGE_LABEL, IMAGE_ACCEPT, UPLOAD_IMAGE_LABEL, addImageState } from '../../lib/addImageUi.mjs';
import styles from './ImageUploadField.module.css';

/**
 * The ONE way an admin adds or replaces an image: two side-by-side 48px buttons,
 * "Upload Image" (file chooser) and "Choose from Drive" (Google Picker), plus a
 * short helper line. Every admin image screen uses this so it looks and behaves
 * the same everywhere.
 *
 * Props
 *  - onFiles(File[])   user chose files from this computer (type/size checks are the caller's)
 *  - onPick(files[])   user picked files in Drive: [{ id, name, mimeType, size }]
 *  - multiple          allow several files / Drive picks (default false)
 *  - busy              an upload is running (disables both buttons)
 *  - progress          0..1 upload progress, shown while busy (omit for an indeterminate bar)
 *  - busyText          screen-reader text for the progress bar
 *  - error             plain error text to show under the buttons
 *  - onError(message)  receives errors from the Drive picker
 *  - tone             'dark' (default, admin panels) or 'light' (on the cream guide canvas)
 *  - disabled, extra (node, rendered as a small text link under the help line)
 */
let statusPromise = null;
let statusAt = 0;
export function loadDriveStatus() {
  if (!statusPromise || Date.now() - statusAt > 20000) {
    statusAt = Date.now();
    statusPromise = fetch('/api/admin-drive/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return statusPromise;
}

export default function AddImageButtons({ onFiles, onPick, multiple = false, busy = false, progress = null, busyText = 'Saving image to Google Drive', error = '', onError, disabled = false, extra = null, tone = 'dark' }) {
  const id = useId();
  const inputRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(false);
  useEffect(() => {
    let live = true;
    loadDriveStatus().then((s) => { if (live) setStatus(s); });
    return () => { live = false; };
  }, []);
  const state = addImageState(status, { busy, disabled });
  const notes = state.notes;
  const describedBy = `${id}-help${notes.length ? ` ${id}-note` : ''}${error ? ` ${id}-err` : ''}`;

  function chosen(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (files.length) onFiles?.(files);
  }

  return (
    <div className={`${styles.add}${tone === 'light' ? ` ${styles.toneLight}` : ''}`} data-add-image>
      <div className={styles.addButtons} role="group" aria-label="Add an image" aria-describedby={describedBy}>
        <button type="button" className={`${styles.btn} ${styles.addBtn} ${styles.primary}`} disabled={state.upload.disabled} onClick={() => inputRef.current?.click()}>
          {UPLOAD_IMAGE_LABEL}
        </button>
        <DriveImagePicker
          className={`${styles.addBtn} ${styles.addDrive}`} label={DRIVE_IMAGE_LABEL} multiple={multiple}
          disabled={state.drive.disabled} onPick={onPick} onError={onError}
        />
        <input ref={inputRef} type="file" hidden multiple={multiple} accept={IMAGE_ACCEPT} onChange={chosen} tabIndex={-1} aria-hidden="true" />
      </div>
      <p className={styles.hint} id={`${id}-help`}>{ADD_IMAGE_HELP}</p>
      {notes.length ? (
        <p className={styles.addNote} id={`${id}-note`} role="status">
          {notes.map((n) => n.text).join('. ')}.{' '}
          {notes[0].kind === 'connect' ? <a href="/admin/dashboard/gallery">Open the Drive connection steps</a> : <button type="button" className={styles.linkBtn} onClick={() => setSetup(true)}>See the setup steps</button>}
        </p>
      ) : null}
      {busy ? <progress className={styles.progress} max="1" value={progress || undefined} aria-label={busyText} /> : null}
      {error ? <p className={styles.error} id={`${id}-err`} role="alert">{error}</p> : null}
      {extra}
      <AdminDialog open={setup} title="Google Picker is not set up yet" onClose={() => setSetup(false)}
        footer={<button type="button" className={styles.btn} onClick={() => setSetup(false)}>Close</button>}>
        <p>Upload Image still works. To also use Choose from Drive, finish this one-time setup:</p>
        <ol className={styles.steps}>{PICKER_SETUP_STEPS.map((step) => <li key={step}>{step}</li>)}</ol>
      </AdminDialog>
    </div>
  );
}
