'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { guideCategories } from '../../../../lib/guideValidation.mjs';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Field, Input, Table } from '../../../../components/ui';

export default function AdminGuidesPage() {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmGuide, setConfirmGuide] = useState(null);
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);
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
      setNewCategory('');
      setStatus(`“${result.category.name}” added to the Guides page.`);
    } catch (err) { setError(err.message); }
    finally { setCategorySaving(false); }
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

  // Creates the draft record straight away, then opens the page builder on it.
  async function createGuide() {
    setCreating(true);
    setError('');
    setStatus('');
    const taken = new Set(guides.map(g => g.slug));
    const position = guides.reduce((max, guide) => Math.max(max, Number(guide.position) || 0), 0) + 10;
    try {
      for (let attempt = 1; attempt <= 30; attempt += 1) {
        const slug = attempt === 1 ? 'untitled-guide' : `untitled-guide-${attempt}`;
        if (taken.has(slug)) continue;
        const response = await fetch('/api/admin-guides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, title: 'Untitled guide', category: categoryNames[0] || 'Kingdom Guide', description: '', body: '', position, is_published: false, access_level: 'public' }),
        });
        const result = await response.json();
        if (response.status === 409) continue;
        if (!response.ok) throw new Error(result.error || 'Unable to create guide.');
        router.push(`/admin/dashboard/guides/${result.guide.slug}`);
        return;
      }
      throw new Error('Could not find a free address for a new guide. Rename an existing "untitled" guide first.');
    } catch (err) {
      setError(err.message || 'Unable to create guide.');
      setCreating(false);
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
      subtitle="Design guide pages with the page builder and manage categories."
      onLogout={handleLogout}
      counters={[
        { label: 'Total guides', value: guides.length },
        { label: 'Published', value: guides.filter((guide) => guide.is_published).length },
        { label: 'Drafts', value: guides.filter((guide) => !guide.is_published).length },
      ]}
    >
      {error && <p className="guide-message error" role="alert">{error}</p>}
      {status && <p className="guide-message success" role="status">{status}</p>}

      <div style={{ marginBottom: 16 }}>
        <Button onClick={createGuide} disabled={creating}>{creating ? 'Creating…' : '+ New guide'}</Button>
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
          <Button onClick={createCategory} disabled={categorySaving || !newCategory.trim()}>{categorySaving ? 'Creating…' : 'Create category'}</Button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} columns={5} />
      ) : guides.length === 0 ? (
        <div className="k-plate" style={{ padding: 24 }}>No guides yet. Choose “New guide” to design the first one.</div>
      ) : (
        <Table className="stack-table">
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
                    <Link href={`/admin/dashboard/guides/${guide.slug}`} className="ui-btn ui-btn-quiet">Edit</Link>
                    <Link href={`/guides/${guide.slug}`} className="ui-btn ui-btn-quiet" target="_blank" rel="noopener noreferrer">View page</Link>
                    <Button variant="quiet" onClick={() => setConfirmGuide(guide)}>Remove</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

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
