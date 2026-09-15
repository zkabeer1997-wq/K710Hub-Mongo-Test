'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { guideCategories } from '../../../../lib/guideValidation.mjs';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Field, Input, Select, Table, Textarea } from '../../../../components/ui';

const EMPTY_FORM = {
  slug: '',
  title: '',
  category: 'Kingdom Guide',
  description: '',
  body: '',
  f2p_content: '',
  spender_content: '',
  position: '0',
  is_published: false,
  access_level: 'public',
};

const CONTENT_TABS = [
  { id: 'body', label: 'Shared' },
  { id: 'f2p_content', label: 'F2P Content' },
  { id: 'spender_content', label: 'Spender Content' },
];

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export default function AdminGuidesPage() {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugWasEdited, setSlugWasEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmGuide, setConfirmGuide] = useState(null);
  const router = useRouter();
  const [editingSlug, setEditingSlug] = useState(null);
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [photoDescription, setPhotoDescription] = useState('');
  const [contentTab, setContentTab] = useState('body');
  const bodyRef = useRef(null);
  const editorRef = useRef(null);
  const categoryNames = guideCategories(guides, categories);

  async function loadCategories() {
    try {
      const response = await fetch('/api/admin-guide-categories', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load categories.');
      setCategories(result.categories || []);
    } catch (err) { setError(err.message); }
  }

  async function createCategory() {
    setCategorySaving(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch('/api/admin-guide-categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategory }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create category.');
      setCategories(current => [...current, result.category]);
      setForm(current => ({ ...current, category: result.category.name }));
      setNewCategory('');
      setStatus(`“${result.category.name}” added to the Guides page.`);
    } catch (err) { setError(err.message); }
    finally { setCategorySaving(false); }
  }

  function openEdit(guide) {
    setEditingSlug(guide.slug);
    setForm({ ...EMPTY_FORM, ...guide, position: String(guide.position) });
    setSlugWasEdited(true);
    setPreview(false);
    setPhotoDescription('');
    setContentTab('body');
    setShowCreate(true);
    setError('');
    setStatus('');
  }

  useEffect(() => {
    if (showCreate) {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      editorRef.current?.querySelector('input')?.focus({ preventScroll: true });
    }
  }, [showCreate, editingSlug]);

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || !file.size || file.size > 3 * 1024 * 1024) {
      setError('Choose a JPG, PNG, WebP, or GIF photo no larger than 3 MB.');
      return;
    }
    const position = bodyRef.current?.selectionStart ?? form[contentTab].length;
    setUploading(true);
    setError('');
    setStatus('');
    try {
      const data = new FormData();
      data.append('file', file);
      const response = await fetch('/api/admin-guide-images', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Photo upload failed.');
      const alt = (photoDescription.trim() || file.name.replace(/\.[^.]+$/, '')).replace(/[\[\]\\\r\n]/g, ' ');
      const markdown = `\n\n![${alt}](${result.url})\n\n`;
      setForm(current => ({ ...current, [contentTab]: current[contentTab].slice(0, position) + markdown + current[contentTab].slice(position) }));
      setPhotoDescription('');
      setStatus('Photo inserted. Save the guide to keep it in the article.');
    } catch (err) { setError(err.message || 'Photo upload failed.'); }
    finally { setUploading(false); }
  }

  async function loadGuides() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin-guides', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load guides.');
      setGuides(result.guides || []);
    } catch (err) {
      setError(err.message || 'Unable to load guides.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadGuides(); loadCategories(); }, []);

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  function openCreate() {
    const nextPosition = guides.reduce((max, guide) => Math.max(max, Number(guide.position) || 0), 0) + 10;
    setForm({ ...EMPTY_FORM, position: String(nextPosition) });
    setEditingSlug(null);
    setPreview(false);
    setPhotoDescription('');
    setContentTab('body');
    setSlugWasEdited(false);
    setShowCreate(true);
    setError('');
    setStatus('');
  }

  function closeCreate() {
    if (saving || uploading) return;
    setShowCreate(false);
    setForm(EMPTY_FORM);
  }

  function updateTitle(title) {
    setForm((current) => ({
      ...current,
      title,
      slug: slugWasEdited ? current.slug : slugify(title),
    }));
  }

  async function saveGuide() {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(editingSlug ? `/api/admin-guides/${encodeURIComponent(editingSlug)}` : '/api/admin-guides', {
        method: editingSlug ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, position: Number(form.position) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save guide.');

      setStatus(`“${result.guide.title}” ${editingSlug ? 'saved' : 'created'}${result.guide.is_published ? ' and published' : ' as a draft'}.`);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await loadGuides();
    } catch (err) {
      setError(err.message || 'Unable to save guide.');
    } finally {
      setSaving(false);
    }
  }

  async function removeGuide() {
    if (!confirmGuide || deleting) return;
    setDeleting(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(`/api/admin-guides/${encodeURIComponent(confirmGuide.slug)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to remove guide.');

      setStatus(`“${confirmGuide.title}” removed.`);
      setConfirmGuide(null);
      await loadGuides();
    } catch (err) {
      setError(err.message || 'Unable to remove guide.');
      setConfirmGuide(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminShell
      title="Guides"
      subtitle="Edit guides, attach photos, and manage categories."
      onLogout={handleLogout}
      counters={[
        { label: 'Total guides', value: guides.length },
        { label: 'Published', value: guides.filter((guide) => guide.is_published).length },
        { label: 'Drafts', value: guides.filter((guide) => !guide.is_published).length },
      ]}
    >
      {!showCreate && error && <p className="guide-message error" role="alert">{error}</p>}
      {!showCreate && status && <p className="guide-message success" role="status">{status}</p>}

      <div style={{ marginBottom: 16 }}>
        <Button onClick={openCreate} disabled={showCreate}>+ New guide</Button>
      </div>

      <div className="k-plate" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Categories</h2>
        <p>Categories appear as clickable filters on the public Guides page.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {categoryNames.map(name => <span key={name} className="ui-tag">{name}</span>)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12 }}>
          <Field label="New category" htmlFor="new-guide-category">
            <Input id="new-guide-category" tone="console" maxLength={80} value={newCategory} onChange={event => setNewCategory(event.target.value)} disabled={categorySaving} />
          </Field>
          <Button onClick={createCategory} disabled={categorySaving || saving || uploading || !newCategory.trim()}>{categorySaving ? 'Creating…' : 'Create category'}</Button>
        </div>
      </div>

      {showCreate && (
        <div ref={editorRef} className="k-plate admin-guide-editor" style={{ scrollMarginTop: 100, padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0 }}>{editingSlug ? 'Edit guide' : 'New guide'}</h2>
          <fieldset disabled={saving || uploading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Field label="Title" htmlFor="guide-title">
              <Input id="guide-title" tone="console" value={form.title} maxLength={180} onChange={(event) => updateTitle(event.target.value)} />
            </Field>
            <Field label="Slug" htmlFor="guide-slug" hint={`Page URL: /guides/${form.slug}${editingSlug && editingSlug !== form.slug ? ' — the old URL will stop working after saving' : ''}`}>
              <Input
                id="guide-slug"
                tone="console"
                value={form.slug}
                maxLength={80}
                onChange={(event) => {
                  setSlugWasEdited(true);
                  setForm((current) => ({ ...current, slug: event.target.value.toLowerCase() }));
                }}
              />
            </Field>
            <Field label="Category" htmlFor="guide-category" hint="Choose an existing category or type a new one.">
              <Input id="guide-category" list="guide-category-options" tone="console" value={form.category} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} />
            </Field>
            <Field label="Library position" htmlFor="guide-position" hint="Lower numbers appear first">
              <Input id="guide-position" tone="console" type="number" min="0" max="100000" step="1" value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} />
            </Field>
            <Field label="Guide access" htmlFor="guide-access">
              <Select id="guide-access" tone="console" value={form.access_level || 'public'} onChange={event => setForm(current => ({ ...current, access_level: event.target.value }))}>
                <option value="public">Public Access</option><option value="members">Member Access — login required</option>
              </Select>
            </Field>
            <Field label="Status" htmlFor="guide-status">
              <Select id="guide-status" tone="console" value={form.is_published ? 'published' : 'draft'} onChange={(event) => setForm((current) => ({ ...current, is_published: event.target.value === 'published' }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </Select>
            </Field>
          </div>
          <datalist id="guide-category-options">{categoryNames.map(name => <option key={name} value={name} />)}</datalist>
          <Field label="Short description" htmlFor="guide-description">
            <Textarea id="guide-description" tone="console" rows={3} maxLength={500} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </Field>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12 }}>
            <Field label="Photo description" htmlFor="guide-photo-description" hint="Describe the photo for readers who cannot see it.">
              <Input id="guide-photo-description" tone="console" value={photoDescription} maxLength={240} onChange={event => setPhotoDescription(event.target.value)} />
            </Field>
            <Field label={uploading ? 'Uploading photo…' : 'Attach photo'} htmlFor="guide-photo" hint="JPG, PNG, WebP, or GIF · up to 3 MB each">
              <Input id="guide-photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadPhoto} />
            </Field>
          </div>
          <div className="admin-subtabs" role="tablist" aria-label="Guide content">
            {CONTENT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={contentTab === tab.id}
                className={`admin-subtab${contentTab === tab.id ? ' is-active' : ''}`}
                onClick={() => setContentTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {(contentTab === 'f2p_content' || contentTab === 'spender_content') && (
            <p className="hint">Optional. Shown as its own tab on the public guide page when either this or the other archetype tab has content; readers see a shared/default view (the Shared tab) when both are empty.</p>
          )}

          <Button variant="quiet" onClick={() => setPreview(current => !current)}>{preview ? 'Back to text' : 'Preview guide'}</Button>
          {preview ? (
            <section className="admin-guide-preview" aria-label="Guide preview">
              <h2>{form.title || 'Untitled guide'}</h2>
              <p>{form.description}</p>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{form[contentTab] || 'No guide text yet.'}</ReactMarkdown>
            </section>
          ) : (
            <Field label="Guide text" htmlFor="guide-body" hint="Markdown supported. Photos insert at the cursor; delete their image line to remove them.">
              <Textarea id="guide-body" ref={bodyRef} tone="console" rows={16} maxLength={120000} value={form[contentTab]} onChange={(event) => setForm((current) => ({ ...current, [contentTab]: event.target.value }))} />
            </Field>
          )}
          </fieldset>
          {error && <p className="guide-message error" role="alert">{error}</p>}
          {status && <p className="guide-message success" role="status">{status}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={saveGuide} disabled={saving || uploading || categorySaving}>{saving ? 'Saving…' : editingSlug ? 'Save changes' : 'Create guide'}</Button>
            <Button variant="quiet" onClick={closeCreate} disabled={saving || uploading}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={4} columns={5} />
      ) : guides.length === 0 ? (
        <div className="k-plate" style={{ padding: 24 }}>No guides yet. Create the first guide above.</div>
      ) : (
        <Table>
          <thead>
            <tr><th>Position</th><th>Title</th><th>Category</th><th>Status</th><th>Updated</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {guides.map((guide) => (
              <tr key={guide.slug}>
                <td>{guide.position}</td>
                <td><strong>{guide.title}</strong><br /><span style={{ opacity: 0.7 }}>/guides/{guide.slug}</span></td>
                <td>{guide.category}</td>
                <td>{guide.is_published ? 'Published' : 'Draft'} · {guide.access_level === 'members' ? 'Members' : 'Public'}</td>
                <td>{guide.updated_at ? new Date(guide.updated_at).toLocaleString() : '—'}</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Button variant="quiet" onClick={() => openEdit(guide)} disabled={showCreate}>Open / Edit</Button>
                    <Link href={`/guides/${guide.slug}`} className="ui-btn ui-btn-quiet" target="_blank" rel="noopener noreferrer">View page</Link>
                    <Button variant="quiet" onClick={() => setConfirmGuide(guide)} disabled={showCreate}>Remove</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <style jsx>{`
        .admin-guide-preview{padding:24px;background:rgba(0,0,0,.12);border:1px solid var(--edge);overflow-wrap:anywhere;font-size:16px;line-height:1.7}
        .admin-guide-preview :global(img){max-width:100%;height:auto;display:block;margin:16px auto}
        .admin-guide-preview :global(table){display:block;overflow-x:auto}
        .admin-guide-preview :global(pre){overflow-x:auto}
      `}</style>
      <ConfirmDialog
        open={Boolean(confirmGuide)}
        title="Remove this guide?"
        message={confirmGuide ? `“${confirmGuide.title}” will be permanently deleted from the guide library. This cannot be undone.` : ''}
        confirmLabel={deleting ? 'Removing…' : 'Remove guide'}
        onConfirm={removeGuide}
        onCancel={() => { if (!deleting) setConfirmGuide(null); }}
      />
    </AdminShell>
  );
}
