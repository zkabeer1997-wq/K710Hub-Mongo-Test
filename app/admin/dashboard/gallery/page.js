'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import { Button, Field, Input, Select, Textarea } from '../../../../components/ui';

const EMPTY = { title: '', caption: '', alt_text: '', position: '0', is_published: true };

export default function AdminGalleryPage() {
  const [images, setImages] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
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

  useEffect(() => { loadImages(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function logout() { await fetch('/api/admin-logout', { method: 'POST' }); router.push('/admin/login'); router.refresh(); }

  function chooseFile(event) {
    const next = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(next); setPreview(next ? URL.createObjectURL(next) : ''); setError('');
  }

  async function upload(event) {
    event.preventDefault();
    if (!file) { setError('Choose an image to upload.'); return; }
    setSaving(true); setError(''); setStatus('');
    const body = new FormData();
    body.append('file', file);
    Object.entries(form).forEach(([key, value]) => body.append(key, String(value)));
    try {
      const response = await fetch('/api/admin-gallery', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to upload image.');
      setStatus('Image added to the gallery.'); setForm(EMPTY); setFile(null);
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

      <form className="gallery-admin-upload k-plate" onSubmit={upload}>
        <div className="gallery-admin-preview">{preview ? <img src={preview} alt="New image preview" /> : <span>Image preview</span>}</div>
        <div className="gallery-admin-fields">
          <h2>Add an image</h2>
          <Field label="Image" hint="JPG, PNG, WebP, or GIF · maximum 4 MB"><Input id="gallery-file" tone="console" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseFile} /></Field>
          <div className="gallery-admin-field-grid">
            <Field label="Title" hint="Optional"><Input tone="console" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Display order" hint="Lower numbers appear first"><Input tone="console" type="number" min="0" max="100000" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
          </div>
          <Field label="Image description" hint="Required for screen readers"><Input tone="console" value={form.alt_text} maxLength={240} onChange={(e) => setForm({ ...form, alt_text: e.target.value })} /></Field>
          <Field label="Caption" hint="Optional"><Textarea tone="console" rows={2} value={form.caption} maxLength={500} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></Field>
          <Field label="Visibility"><Select tone="console" value={form.is_published ? 'published' : 'hidden'} onChange={(e) => setForm({ ...form, is_published: e.target.value === 'published' })}><option value="published">Published</option><option value="hidden">Hidden</option></Select></Field>
          <Button type="submit" disabled={saving}>{saving ? 'Uploading…' : 'Upload image'}</Button>
        </div>
      </form>

      <h2 className="gallery-admin-list-title">Gallery images</h2>
      {loading ? <div className="k-plate gallery-admin-empty">Loading gallery…</div> : images.length === 0 ? <div className="k-plate gallery-admin-empty">No images yet. Upload the first image above.</div> : (
        <div className="gallery-admin-list">
          {images.map((image) => <article className="k-plate gallery-admin-row" key={image.id}><img src={image.image_url} alt="" /><div><strong>{image.title || 'Untitled image'}</strong><span>{image.alt_text}</span><small>Position {image.position} · {image.is_published ? 'Published' : 'Hidden'}</small></div><div className="gallery-admin-actions"><Button variant="quiet" onClick={() => setEditing({ ...image })}>Edit</Button><Button variant="quiet" onClick={() => setRemoveTarget(image)}>Remove</Button></div></article>)}
        </div>
      )}

      {editing && <div className="gallery-admin-modal" role="dialog" aria-modal="true" aria-labelledby="edit-gallery-title"><div className="k-plate"><h2 id="edit-gallery-title">Edit image</h2><img src={editing.image_url} alt="" /><Field label="Title"><Input tone="console" maxLength={120} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field><Field label="Image description"><Input tone="console" maxLength={240} value={editing.alt_text} onChange={(e) => setEditing({ ...editing, alt_text: e.target.value })} /></Field><Field label="Caption"><Textarea tone="console" rows={3} maxLength={500} value={editing.caption} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} /></Field><div className="gallery-admin-field-grid"><Field label="Display order"><Input tone="console" type="number" min="0" max="100000" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></Field><Field label="Visibility"><Select tone="console" value={editing.is_published ? 'published' : 'hidden'} onChange={(e) => setEditing({ ...editing, is_published: e.target.value === 'published' })}><option value="published">Published</option><option value="hidden">Hidden</option></Select></Field></div><div className="gallery-admin-actions"><Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button><Button variant="quiet" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button></div></div></div>}

      <ConfirmDialog open={Boolean(removeTarget)} title="Remove this image?" message="This permanently deletes the image from the gallery and storage. This cannot be undone." confirmLabel={saving ? 'Removing…' : 'Remove image'} onConfirm={removeImage} onCancel={() => { if (!saving) setRemoveTarget(null); }} />
      <style>{`.gallery-admin-message{padding:12px 14px;margin:0 0 16px}.gallery-admin-message.error{background:#3c1717;color:#fecaca}.gallery-admin-message.success{background:#123124;color:#bbf7d0}.gallery-admin-upload{display:grid;grid-template-columns:minmax(260px,.75fr) minmax(320px,1.25fr);gap:24px;padding:22px;margin-bottom:30px}.gallery-admin-preview{min-height:320px;background:#0a0d12;display:grid;place-items:center;color:#747c86}.gallery-admin-preview img{width:100%;height:100%;max-height:520px;object-fit:contain}.gallery-admin-fields{display:flex;flex-direction:column;gap:13px}.gallery-admin-fields h2,.gallery-admin-list-title{margin:0}.gallery-admin-field-grid{display:grid;grid-template-columns:1fr 160px;gap:12px}.gallery-admin-list-title{margin-bottom:14px}.gallery-admin-list{display:flex;flex-direction:column;gap:10px}.gallery-admin-row{display:grid;grid-template-columns:130px 1fr auto;align-items:center;gap:18px;padding:12px}.gallery-admin-row>img{width:130px;height:82px;object-fit:cover}.gallery-admin-row>div:nth-child(2){display:flex;flex-direction:column;gap:5px}.gallery-admin-row span,.gallery-admin-row small{color:var(--text-muted)}.gallery-admin-actions{display:flex;gap:8px;flex-wrap:wrap}.gallery-admin-empty{padding:28px}.gallery-admin-modal{position:fixed;z-index:200;inset:0;background:rgba(3,5,8,.82);display:grid;place-items:center;padding:20px}.gallery-admin-modal>div{width:min(620px,100%);max-height:92vh;overflow:auto;padding:22px;display:flex;flex-direction:column;gap:14px}.gallery-admin-modal img{width:100%;max-height:260px;object-fit:contain;background:#090b0f}@media(max-width:800px){.gallery-admin-upload{grid-template-columns:1fr}.gallery-admin-preview{min-height:220px}.gallery-admin-row{grid-template-columns:90px 1fr}.gallery-admin-row>img{width:90px;height:70px}.gallery-admin-row>.gallery-admin-actions{grid-column:1/-1}.gallery-admin-field-grid{grid-template-columns:1fr}}`}</style>
    </AdminShell>
  );
}
