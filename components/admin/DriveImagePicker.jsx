'use client';

import { useRef, useState } from 'react';
import AdminDialog from './AdminDialog';
import styles from './ImageUploadField.module.css';

/**
 * "Choose from Google Drive" button (reusable, admin pages only).
 *
 * Opens the Google Picker with the connected Drive account (restricted to
 * image types) and calls `onPick([{ id, name, mimeType, size }])` with the
 * picked file ids. The caller sends the id to its own save endpoint, which
 * COPIES the file into the destination folder (lib/siteImages.mjs copyPicked),
 * so the site never depends on a file the picker user may later delete.
 *
 * Flow: GET /api/admin-drive/picker-config (admin only; short-lived access
 * token + public developer key + app id; the refresh token never leaves the
 * server) -> load https://apis.google.com/js/api.js -> gapi.load('picker').
 * Local dev with the fake Drive opens a simple built-in list instead.
 *
 * Props: onPick(files), onError?(message), label?, disabled?, multiple?, className?
 */
const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
let pickerScript = null;

function loadPickerApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.picker) return Promise.resolve();
  pickerScript ||= new Promise((resolve, reject) => {
    const done = () => window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('picker load')) });
    if (window.gapi?.load) { done(); return; }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    const nonce = document.querySelector('script[nonce]')?.nonce || document.querySelector('script[nonce]')?.getAttribute('nonce');
    if (nonce) script.nonce = nonce;
    script.onload = done;
    script.onerror = () => { pickerScript = null; reject(new Error('api.js')); };
    document.head.appendChild(script);
  });
  return pickerScript;
}

export default function DriveImagePicker({ onPick, onError, label = 'Choose from Google Drive', disabled = false, multiple = false, className = '' }) {
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(null);
  const [fakeFiles, setFakeFiles] = useState(null);
  const [selected, setSelected] = useState([]);
  const buttonRef = useRef(null);

  function fail(message) { onError?.(message); }

  async function open() {
    setBusy(true);
    try {
      const response = await fetch('/api/admin-drive/picker-config', { cache: 'no-store' });
      const config = await response.json().catch(() => ({}));
      if (response.status === 409 || config.needsConnect) { fail(config.error || 'Connect Google Drive first (one-time setup).'); return; }
      if (!response.ok) { fail(config.error || 'Google Drive is unavailable right now.'); return; }
      if (config.fake) {
        const list = await fetch('/api/admin-drive/fake-files', { cache: 'no-store' });
        const body = await list.json().catch(() => ({}));
        setSelected([]);
        setFakeFiles(body.files || []);
        return;
      }
      if (!config.configured) { setSetup(config); return; }
      try { await loadPickerApi(); } catch { fail('Google Picker could not be loaded. Check your connection and try again.'); return; }
      const { google } = window;
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES).setMimeTypes(IMAGE_TYPES).setIncludeFolders(true).setSelectFolderEnabled(false);
      let builder = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(config.accessToken)
        .setDeveloperKey(config.developerKey)
        .setAppId(config.appId)
        .setOrigin(window.location.protocol + '//' + window.location.host)
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            onPick((data.docs || []).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType, size: d.sizeBytes ? Number(d.sizeBytes) : null })));
          }
        });
      if (multiple) builder = builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      builder.build().setVisible(true);
    } catch {
      fail('Google Drive is unavailable right now.');
    } finally { setBusy(false); }
  }

  function toggle(file) {
    setSelected((cur) => (cur.some((f) => f.id === file.id)
      ? cur.filter((f) => f.id !== file.id)
      : (multiple ? [...cur, file] : [file])));
  }
  function confirmFake() {
    const picked = selected.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size }));
    setFakeFiles(null);
    if (picked.length) onPick(picked);
  }

  return (
    <>
      <button ref={buttonRef} type="button" className={`${styles.btn} ${className}`} onClick={open} disabled={disabled || busy}>
        {busy ? 'Opening Google Drive…' : label}
      </button>

      <AdminDialog open={Boolean(setup)} title="Google Picker is not set up yet" onClose={() => setSetup(null)}
        footer={<button type="button" className={styles.btn} onClick={() => setSetup(null)}>Close</button>}>
        <p>Uploading from this computer works. To also choose files from Google Drive, finish this one-time setup:</p>
        <ol className={styles.steps}>{(setup?.steps || []).map((step) => <li key={step}>{step}</li>)}</ol>
        {setup?.missing?.length ? <p className={styles.hint}>Missing: {setup.missing.join(', ')}</p> : null}
      </AdminDialog>

      <AdminDialog open={Array.isArray(fakeFiles)} title="Choose from Google Drive (local test picker)" onClose={() => setFakeFiles(null)}
        footer={<><button type="button" className={styles.btn} onClick={() => setFakeFiles(null)}>Cancel</button><button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!selected.length} onClick={confirmFake}>Select</button></>}>
        <p className={styles.hint}>Local development only: this lists images in the fake Drive. The real site uses the Google Picker.</p>
        {fakeFiles?.length ? (
          <ul className={styles.fakeGrid} aria-label="Images in Google Drive">
            {fakeFiles.map((f) => (
              <li key={f.id}>
                <button type="button" className={styles.fakeItem} aria-pressed={selected.some((s) => s.id === f.id)} onClick={() => toggle(f)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/admin-drive/preview/${f.id}`} alt="" loading="lazy" />
                  <span>{f.name}</span>
                  <small>{f.folderPath || 'My Drive'}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : <p>No images found in the fake Drive.</p>}
      </AdminDialog>
    </>
  );
}
