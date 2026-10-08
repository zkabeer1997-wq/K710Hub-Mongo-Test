'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import { Button, Field, Input, Select, Textarea } from '../../../../components/ui';
import DriveImagePicker from '../../../../components/admin/DriveImagePicker';

const EMPTY = { title: '', caption: '', alt_text: '', position: '0', is_published: true };

export default function AdminGalleryPage() {
  const [drive, setDrive] = useState(null);
  const [migration, setMigration] = useState({ running: false, moved: 0, failed: [], total: 0 });
  const [images, setImages] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [picked, setPicked] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const router = useRouter();

  async function loadImages() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin-gallery', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load gallery images.');
      setImages(result.images || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  async function loadDrive() {
    try {
      const response = await fetch('/api/admin-gallery/drive', { cache: 'no-store' });
      const result = await response.json();
      if (response.ok) setDrive(result);
    } catch { /* status stays unknown */ }
  }

  async function disconnectDrive() {
    if (!window.confirm('Disconnect Google Drive? Gallery images will stop loading until you reconnect.')) return;
    const response = await fetch('/api/admin-gallery/drive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disconnect' }) });
    if (!response.ok) setError('Unable to disconnect Google Drive.'); else setStatus('Google Drive disconnected.');
    await loadDrive();
  }

  async function moveToDrive() {
    const skipIds = []; let moved = 0; const total = drive?.legacyCount || 0;
    setError(''); setStatus('');
    setMigration({ running: true, moved: 0, failed: [], total });
    try {
      for (let guard = 0; guard < 500; guard += 1) {
        const response = await fetch('/api/admin-gallery/migrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skipIds }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Migration failed.');
        moved += result.migrated.length;
        result.failed.forEach((item) => skipIds.push(item.id));
        setMigration({ running: true, moved, failed: [...skipIds], total });
        if (!result.remaining || (!result.migrated.length && !result.failed.length)) break;
      }
      setStatus(`Moved ${moved} image${moved === 1 ? '' : 's'} to Google Drive.${skipIds.length ? ` ${skipIds.length} could not be moved and were left as they were.` : ''}`);
    } catch (err) { setError(err.message); }
    setMigration((m) => ({ ...m, running: false }));
    await Promise.all([loadDrive(), loadImages()]);
  }

  // Same batch loop for guide images and applicant screenshots: POST until nothing remains.
  async function moveOther(url, label, key, listKey) {
    const skip = []; let moved = 0;
    setError(''); setStatus('');
    setMigration({ running: true, moved: 0, failed: [], total: 0 });
    try {
      for (let guard = 0; guard < 500; guard += 1) {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: skip }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Migration failed.');
        moved += result.migrated.length;
        result.failed.forEach((item) => skip.push(item[listKey]));
        setMigration({ running: true, moved, failed: [...skip], total: 0 });
        if (!result.remaining || (!result.migrated.length && !result.failed.length)) break;
      }
      setStatus(`Moved ${moved} ${label} to Google Drive.${skip.length ? ` ${skip.length} could not be moved and were left as they were.` : ''}`);
    } catch (err) { setError(err.message); }
    setMigration((m) => ({ ...m, running: false }));
    await loadDrive();
  }

  useEffect(() => { loadImages(); loadDrive(); }, []);
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('drive');
    if (flag === 'connected') setStatus('Google Drive connected.');
    else if (flag === 'failed') setError('Google Drive could not be connected. Try again.');
    else if (flag === 'not-configured') setError('Google sign-in is not configured on this deployment (GOOGLE_DRIVE_CLIENT_ID / SECRET).');
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function logout() { await fetch('/api/admin-logout', { method: 'POST' }); router.push('/admin/login'); router.refresh(); }

  function chooseFile(event) {
    const next = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(next); setPicked(null); setPreview(next ? URL.createObjectURL(next) : ''); setError('');
  }

  async function upload(event) {
    event.preventDefault();
    if (!file && !picked) { setError('Choose an image to upload, or choose one from Google Drive.'); return; }
    setSaving(true); setError(''); setStatus('');
    const body = new FormData();
    if (picked) body.append('drive_file_id', picked.id); else body.append('file', file);
    Object.entries(form).forEach(([key, value]) => body.append(key, String(value)));
    try {
      const response = await fetch('/api/admin-gallery', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to upload image.');
      setStatus('Image added to the gallery.'); setForm(EMPTY); setFile(null); setPicked(null);
      if (preview) URL.revokeObjectURL(preview); setPreview('');
      document.getElementById('gallery-file').value = '';
      await loadImages();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true); setError(''); setStatus('');
    try {
      const response = await fetch(`/api/admin-gallery/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update image.');
      setEditing(null); setStatus('Gallery image updated.'); await loadImages();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function removeImage() {
    if (!removeTarget) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/admin-gallery/${removeTarget.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to remove image.');
      setRemoveTarget(null); setStatus('Image removed from the gallery.'); await loadImages();
    } catch (err) { setError(err.message); setRemoveTarget(null); } finally { setSaving(false); }
  }

  return (
    <AdminShell title="Gallery" subtitle="Upload and manage the images shown on the public gallery and homepage." onLogout={logout} counters={[{ label: 'Images', value: images.length }, { label: 'Published', value: images.filter((item) => item.is_published).length }, { label: 'Hidden', value: images.filter((item) => !item.is_published).length }]}>
      {error && <p className="gallery-admin-message error" role="alert">{error}</p>}
      {status && <p className="gallery-admin-message success" role="status">{status}</p>}

      <section className="k-plate gallery-admin-drive" aria-labelledby="gallery-drive-title">
        <div>
          <h2 id="gallery-drive-title">Google Drive storage</h2>
          {!drive ? <p>Checking Google Drive…</p> : drive.connected ? (
            <p><span className="gallery-admin-pill ok">Connected</span> {drive.fake ? 'Connected (local fake Drive) · folder K710 Website' : <>as <strong>{drive.email || 'the kingdom account'}</strong> · folder <strong>{drive.folderName || 'K710 Website'}</strong></>}</p>
          ) : (
            <p><span className="gallery-admin-pill">Not connected</span> Connect Google Drive first (one-time setup). Images are stored in a private Drive folder and served through this site.</p>
          )}
        </div>
        <div className="gallery-admin-actions">
          {drive && !drive.fake && (drive.connected
            ? <><a className="gallery-admin-link" href="/api/google-drive/storage-auth">Reconnect</a><Button variant="quiet" onClick={disconnectDrive}>Disconnect</Button></>
            : <a className="gallery-admin-link primary" href="/api/google-drive/storage-auth">Connect Google Drive</a>)}
        </div>
        {drive?.connected && drive.legacyGuideImages > 0 && (
          <div className="gallery-admin-migrate">
            <p><strong>{drive.legacyGuideImages}</strong> older guide image{drive.legacyGuideImages === 1 ? ' is' : 's are'} still stored in the database.</p>
            <Button onClick={() => moveOther('/api/admin-guide-images/migrate', 'guide images', 'skipPaths', 'path')} disabled={migration.running}>Move guide images to Drive</Button>
          </div>
        )}
        {drive?.connected && drive.waitingApplications > 0 && (
          <div className="gallery-admin-migrate">
            <p><strong>{drive.waitingApplications}</strong> application{drive.waitingApplications === 1 ? ' has' : 's have'} screenshots waiting to move to Drive.</p>
            <Button onClick={() => moveOther('/api/admin-interest-submissions/migrate', 'applications', 'skipIds', 'id')} disabled={migration.running}>Move to Drive</Button>
          </div>
        )}
        {drive?.connected && drive.legacyCount > 0 && (
          <div className="gallery-admin-migrate">
            <p><strong>{drive.legacyCount}</strong> older image{drive.legacyCount === 1 ? ' is' : 's are'} still stored in the database. Move {drive.legacyCount === 1 ? 'it' : 'them'} to Drive to keep the site fast.</p>
            <Button onClick={moveToDrive} disabled={migration.running}>{migration.running ? `Moving… ${migration.moved}/${migration.total}` : 'Move existing images to Drive'}</Button>
            {migration.running && <progress max={migration.total || 1} value={migration.moved + migration.failed.length} aria-label="Migration progress" />}
          </div>
        )}
      </section>

      <form className="gallery-admin-upload k-plate" onSubmit={upload}>
        <div className="gallery-admin-preview">{preview ? <img src={preview} alt="New image preview" /> : picked ? (drive?.fake ? <img src={`/api/admin-drive/preview/${picked.id}`} alt="Picked image preview" /> : <span>{picked.name}</span>) : <span>Image preview</span>}</div>
        <div className="gallery-admin-fields">
          <h2>Add an image</h2>
          <Field label="Image" hint="JPG, PNG, WebP, or GIF · maximum 4 MB. Saved to Google Drive: K710 Website / Gallery images."><Input id="gallery-file" tone="console" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseFile} aria-label="Upload from this computer" /></Field>
          <div className="gallery-admin-actions" role="group" aria-label="Or choose from Google Drive">
            <DriveImagePicker disabled={saving || (drive && !drive.connected)} onError={setError} onPick={(files) => { const next = files[0]; if (!next) return; if (preview) URL.revokeObjectURL(preview); setPreview(''); setFile(null); const input = document.getElementById('gallery-file'); if (input) input.value = ''; setPicked(next); setError(''); }} />
            {picked && <span className="gallery-admin-pill ok" role="status">Picked from Drive: {picked.name} <button type="button" className="gallery-admin-clear" onClick={() => setPicked(null)} aria-label="Clear the picked Drive image">Clear</button></span>}
          </div>
          <div className="gallery-admin-field-grid">
            <Field label="Title" hint="Optional"><Input tone="console" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Display order" hint="Lower numbers appear first"><Input tone="console" type="number" min="0" max="100000" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
          </div>
          <Field label="Image description" hint="Required for screen readers"><Input tone="console" value={form.alt_text} maxLength={240} onChange={(e) => setForm({ ...form, alt_text: e.target.value })} /></Field>
          <Field label="Caption" hint="Optional"><Textarea tone="console" rows={2} value={form.caption} maxLength={500} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></Field>
          <Field label="Visibility"><Select tone="console" value={form.is_published ? 'published' : 'hidden'} onChange={(e) => setForm({ ...form, is_published: e.target.value === 'published' })}><option value="published">Published</option><option value="hidden">Hidden</option></Select></Field>
          <Button type="submit" disabled={saving || (drive && !drive.connected)} style={{ minHeight: 48 }}>{saving ? 'Uploading…' : 'Upload image'}</Button>{drive && !drive.connected && <p className="gallery-admin-hint" role="status">Connect Google Drive first (one-time setup) to upload images.</p>}
        </div>
      </form>

      <h2 className="gallery-admin-list-title">Gallery images</h2>
      {loading ? <div className="k-plate gallery-admin-empty">Loading gallery…</div> : images.length === 0 ? <div className="k-plate gallery-admin-empty">No images yet. Upload the first image above.</div> : (
        <div className="gallery-admin-list">
          {images.map((image) => <article className="k-plate gallery-admin-row" key={image.id}><img src={image.image_url} alt="" /><div><strong>{image.title || 'Untitled image'}</strong><span>{image.alt_text}</span><small>Position {image.position} · {image.is_published ? 'Published' : 'Hidden'}</small></div><div className="gallery-admin-actions"><Button variant="quiet" onClick={() => setEditing({ ...image })}>Edit</Button><Button variant="quiet" onClick={() => setRemoveTarget(image)}>Remove</Button></div></article>)}
        </div>
      )}

      {editing && <div className="gallery-admin-modal" role="dialog" aria-modal="true" aria-labelledby="edit-gallery-title"><div className="k-plate"><h2 id="edit-gallery-title">Edit image</h2><img src={editing.image_url} alt="" /><Field label="Title"><Input tone="console" maxLength={120} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field><Field label="Image description"><Input tone="console" maxLength={240} value={editing.alt_text} onChange={(e) => setEditing({ ...editing, alt_text: e.target.value })} /></Field><Field label="Caption"><Textarea tone="console" rows={3} maxLength={500} value={editing.caption} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} /></Field><div className="gallery-admin-field-grid"><Field label="Display order"><Input tone="console" type="number" min="0" max="100000" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></Field><Field label="Visibility"><Select tone="console" value={editing.is_published ? 'published' : 'hidden'} onChange={(e) => setEditing({ ...editing, is_published: e.target.value === 'published' })}><option value="published">Published</option><option value="hidden">Hidden</option></Select></Field></div><div className="gallery-admin-actions"><Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button><Button variant="quiet" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button></div></div></div>}

      <ConfirmDialog open={Boolean(removeTarget)} title="Remove this image?" message="This removes the image from the gallery. Its file in Google Drive is moved to the Drive trash, where it stays recoverable for 30 days." confirmLabel={saving ? 'Removing…' : 'Remove image'} onConfirm={removeImage} onCancel={() => { if (!saving) setRemoveTarget(null); }} />
      <style>{`.gallery-admin-drive{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;margin-bottom:18px}.gallery-admin-drive h2{margin:0 0 6px;font-size:16px}.gallery-admin-drive p{margin:0;color:var(--text-muted)}.gallery-admin-pill{display:inline-block;padding:2px 9px;border-radius:999px;background:#2a2f38;color:#cbd2da;font-size:12px;margin-right:6px}.gallery-admin-pill.ok{background:#123124;color:#bbf7d0}.gallery-admin-link{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:6px;border:1px solid #3a414c;color:inherit;text-decoration:none}.gallery-admin-link.primary{background:#e2ad68;color:#17100a;border-color:#e2ad68;font-weight:600}.gallery-admin-migrate{flex-basis:100%;display:flex;flex-wrap:wrap;align-items:center;gap:12px;border-top:1px solid #2a2f38;padding-top:12px}.gallery-admin-migrate progress{flex-basis:100%}.gallery-admin-clear{background:none;border:0;color:inherit;text-decoration:underline;cursor:pointer;min-height:32px;padding:0 6px}.gallery-admin-hint{margin:0;color:var(--text-muted)}.gallery-admin-message{padding:12px 14px;margin:0 0 16px}.gallery-admin-message.error{background:#3c1717;color:#fecaca}.gallery-admin-message.success{background:#123124;color:#bbf7d0}.gallery-admin-upload{display:grid;grid-template-columns:minmax(260px,.75fr) minmax(320px,1.25fr);gap:24px;padding:22px;margin-bottom:30px}.gallery-admin-preview{min-height:320px;background:#0a0d12;display:grid;place-items:center;color:#747c86}.gallery-admin-preview img{width:100%;height:100%;max-height:520px;object-fit:contain}.gallery-admin-fields{display:flex;flex-direction:column;gap:13px}.gallery-admin-fields h2,.gallery-admin-list-title{margin:0}.gallery-admin-field-grid{display:grid;grid-template-columns:1fr 160px;gap:12px}.gallery-admin-list-title{margin-bottom:14px}.gallery-admin-list{display:flex;flex-direction:column;gap:10px}.gallery-admin-row{display:grid;grid-template-columns:130px 1fr auto;align-items:center;gap:18px;padding:12px}.gallery-admin-row>img{width:130px;height:82px;object-fit:cover}.gallery-admin-row>div:nth-child(2){display:flex;flex-direction:column;gap:5px}.gallery-admin-row span,.gallery-admin-row small{color:var(--text-muted)}.gallery-admin-actions{display:flex;gap:8px;flex-wrap:wrap}.gallery-admin-empty{padding:28px}.gallery-admin-modal{position:fixed;z-index:200;inset:0;background:rgba(3,5,8,.82);display:grid;place-items:center;padding:20px}.gallery-admin-modal>div{width:min(620px,100%);max-height:92vh;overflow:auto;padding:22px;display:flex;flex-direction:column;gap:14px}.gallery-admin-modal img{width:100%;max-height:260px;object-fit:contain;background:#090b0f}@media(max-width:800px){.gallery-admin-upload{grid-template-columns:1fr}.gallery-admin-preview{min-height:220px}.gallery-admin-row{grid-template-columns:90px 1fr}.gallery-admin-row>img{width:90px;height:70px}.gallery-admin-row>.gallery-admin-actions{grid-column:1/-1}.gallery-admin-field-grid{grid-template-columns:1fr}}`}</style>
    </AdminShell>
  );
}
