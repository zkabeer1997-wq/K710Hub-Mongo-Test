'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import DriveStatusBanner from '../../../../components/admin/DriveStatusBanner';
import AddImageButtons from '../../../../components/admin/AddImageButtons';
import ImageUploadField from '../../../../components/admin/ImageUploadField';
import Switch from '../../../../components/admin/Switch';
import { useToast } from '../../../../components/ui';
import { heroKey } from '../../../../lib/heroCatalog.mjs';
import styles from './heroes.module.css';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function api(method, body, query = '') {
  const response = await fetch(`/api/admin-heroes${query}`, {
    method, cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'That change could not be saved. Please try again.');
  return json;
}

function Thumb({ hero }) {
  const src = hero.image_url || hero.default_url;
  return (
    <span className={styles.thumb}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${hero.name} portrait`} width="72" height="72" loading="lazy" />
      ) : <span aria-hidden="true">{hero.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

export default function AdminHeroesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [heroes, setHeroes] = useState(null);
  const [removed, setRemoved] = useState([]);
  const [duplicates, setDuplicates] = useState(0);
  const [error, setError] = useState('');
  const [drive, setDrive] = useState(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [rowError, setRowError] = useState({});
  const [renaming, setRenaming] = useState(null); // { key, value }
  const [imageFor, setImageFor] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [bulk, setBulk] = useState(null);

  const applyPayload = useCallback((json) => {
    setHeroes(json.heroes); setRemoved(json.removed || []); setDuplicates(json.duplicates || 0);
  }, []);

  const load = useCallback(async () => {
    try { applyPayload(await api('GET')); setError(''); }
    catch (e) { setError(e.message); }
  }, [applyPayload]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/admin-drive/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setDrive).catch(() => setDrive(null));
  }, []);
  const driveReady = Boolean(drive?.connected);

  async function run(key, optimistic, call, okMessage = 'Saved') {
    const before = heroes;
    setRowError((c) => ({ ...c, [key]: '' }));
    if (optimistic) setHeroes((list) => optimistic(list));
    try {
      const json = await call();
      applyPayload(json);
      toast(okMessage, { type: 'success', duration: 2500 });
      return true;
    } catch (e) {
      setHeroes(before);
      setRowError((c) => ({ ...c, [key]: e.message }));
      return false;
    }
  }

  const setActive = (hero, active) => run(hero.key, (l) => l.map((h) => (h.key === hero.key ? { ...h, active } : h)), () => api('PATCH', { key: hero.key, active }));

  function move(index, delta) {
    const next = [...heroes];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    run(next[target].key, () => next, () => api('PATCH', { order: next.map((h) => h.key) }));
  }

  async function saveImage(hero, image) {
    const ok = await run(hero.key,
      (l) => l.map((h) => (h.key === hero.key ? { ...h, image_url: image ? image.url : null, image_id: image ? image.id : null } : h)),
      () => api('PATCH', { key: hero.key, image_id: image ? image.id : null }), image ? 'Image saved' : 'Image removed');
    if (ok) setImageFor(null);
  }

  async function saveRename(hero) {
    const ok = await run(hero.key, null, () => api('PATCH', { key: hero.key, name: renaming.value }), 'Renamed');
    if (ok) setRenaming(null);
  }

  async function addHero(event) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) { setRowError((c) => ({ ...c, _new: 'Enter the hero name.' })); return; }
    setAdding(true);
    const ok = await run('_new', null, () => api('POST', { name }), `${name} added`);
    setAdding(false);
    if (ok) setNewName('');
  }

  async function confirmRemove() {
    const hero = removeTarget;
    setRemoveTarget(null);
    await run(hero.key, (l) => l.filter((h) => h.key !== hero.key), () => api('DELETE', null, `?key=${encodeURIComponent(hero.key)}`), `${hero.name} removed`);
  }

  const restoreHero = (item) => run(`restore-${item.key}`, null, () => api('POST', { action: 'restore', key: item.key }), `${item.name} restored`);
  const removeDuplicates = () => run('_dupes', null, () => api('POST', { action: 'dedupe' }), 'Duplicate heroes removed');

  // Many images at once: a file named after a hero ("chenko.png", "Long Fei.webp") attaches to that hero.
  async function bulkAttach(items) {
    if (!items.length) return;
    const results = { done: [], skipped: [] };
    setBulk({ running: true, ...results });
    let latest = heroes;
    for (const item of items) {
      const stem = item.name.replace(/\.[^.]+$/, '');
      const hero = latest.find((h) => h.key === heroKey(stem) || h.name.toLowerCase() === stem.toLowerCase());
      if (!hero) { results.skipped.push(`${item.name} (no hero with that name)`); continue; }
      if (item.type && !IMAGE_TYPES.includes(item.type)) { results.skipped.push(`${item.name} (not a JPG, PNG, WebP or GIF)`); continue; }
      try {
        let up;
        if (item.file) {
          const form = new FormData();
          form.append('file', item.file); form.append('folder', 'hero'); form.append('alt', hero.name);
          up = await fetch('/api/admin-drive/images', { method: 'POST', body: form });
        } else {
          up = await fetch('/api/admin-drive/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: 'hero', driveFileId: item.driveFileId, alt: hero.name }) });
        }
        const upJson = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upJson.error || 'upload failed');
        const patched = await api('PATCH', { key: hero.key, image_id: upJson.image.id });
        latest = patched.heroes; setRemoved(patched.removed || []);
        results.done.push(hero.name);
      } catch (e) { results.skipped.push(`${item.name} (${e.message})`); }
    }
    setHeroes(latest);
    setBulk({ running: false, ...results });
    if (results.done.length) toast(`${results.done.length} image${results.done.length === 1 ? '' : 's'} saved`, { type: 'success', duration: 3000 });
  }
  // Many images at once: a file named after a hero ("chenko.png", "Long Fei.webp") attaches to that hero.
  const bulkUpload = (files) => bulkAttach(files.map((file) => ({ name: file.name, type: file.type, file })));
  const bulkPick = (files) => bulkAttach(files.map((f) => ({ name: f.name || '', driveFileId: f.id })));

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  const shown = heroes ? heroes.filter((h) => h.active).length : '—';

  return (
    <AdminShell
      title="Heroes"
      subtitle="The heroes members can pick on the KvK Availability and Flamedragon Tyrant forms, and their pictures"
      onLogout={handleLogout}
      counters={[{ label: 'Shown in forms', value: shown }, { label: 'Total', value: heroes ? heroes.length : '—' }]}
    >
      <DriveStatusBanner />
      <p className={styles.intro}>
        Both forms use this one list. Switch a hero off to hide it from new answers: members who already saved it keep it in the admin lists.
        Pictures are stored in Google Drive (K710 Website, Hero images). Without a picture, the built-in portrait or the hero&apos;s first letter is shown.
      </p>
      {error ? <p className={styles.error} role="alert">{error} <button type="button" className={styles.link} onClick={load}>Try again</button></p> : null}

      <div className={styles.toolbar}>
        <button type="button" className={styles.primary} aria-expanded={addOpen} aria-controls="hero-add-panel" onClick={() => setAddOpen((v) => !v)}>{addOpen ? 'Close' : '+ Add hero'}</button>
      </div>
      {addOpen ? (
      <form id="hero-add-panel" className={styles.addRow} onSubmit={addHero} noValidate>
        <label htmlFor="new-hero">Add hero</label>
        <div className={styles.addControls}>
          <input id="new-hero" value={newName} maxLength={30} autoComplete="off" placeholder="Hero name" onChange={(e) => { setNewName(e.target.value); setRowError((c) => ({ ...c, _new: '' })); }} aria-invalid={rowError._new ? 'true' : undefined} aria-describedby={rowError._new ? 'new-hero-err' : undefined} />
          <button type="submit" className={styles.primary} disabled={adding}>{adding ? 'Adding...' : 'Add hero'}</button>
        </div>
        {rowError._new ? <p className={styles.error} id="new-hero-err" role="alert">{rowError._new}</p> : null}
        <p className={styles.hint}>Add many pictures at once: name each file after the hero (for example <code>chenko.png</code> or <code>long-fei.webp</code>) and it is attached automatically.</p>
        <AddImageButtons multiple onFiles={bulkUpload} onPick={bulkPick} busy={Boolean(bulk?.running)} disabled={!driveReady} />
        {bulk ? (
          <div className={styles.bulk} role="status">
            {bulk.running ? 'Uploading images...' : `${bulk.done.length} attached${bulk.skipped.length ? `, ${bulk.skipped.length} skipped` : ''}.`}
            {bulk.skipped.length ? <ul>{bulk.skipped.map((s) => <li key={s}>{s}</li>)}</ul> : null}
          </div>
        ) : null}
      </form>
      ) : null}

      {!heroes && !error ? <p>Loading heroes...</p> : null}
      {duplicates > 0 ? (
        <div className={styles.notice} role="status">
          <p>The list contains {duplicates} duplicate row{duplicates === 1 ? '' : 's'} (the same hero saved twice). Members only see each hero once; you can clean the extra rows up.</p>
          <button type="button" className={styles.secondary} onClick={removeDuplicates}>Remove duplicates</button>
          {rowError._dupes ? <p className={styles.error} role="alert">{rowError._dupes}</p> : null}
        </div>
      ) : null}
      <ol className={styles.list} aria-label="Heroes">
        {(heroes || []).map((hero, index) => (
          <li key={hero.key} className={`${styles.card} ${hero.active ? '' : styles.off}`}>
            <div className={styles.main}>
              <Thumb hero={hero} />
              <div className={styles.nameBlock}>
                {renaming?.key === hero.key ? (
                  <form className={styles.renameForm} onSubmit={(e) => { e.preventDefault(); saveRename(hero); }}>
                    <label className="sr-only" htmlFor={`rename-${hero.key}`}>New name for {hero.name}</label>
                    <input id={`rename-${hero.key}`} value={renaming.value} maxLength={30} autoFocus onChange={(e) => setRenaming({ key: hero.key, value: e.target.value })} />
                    <button type="submit" className={styles.primary}>Save name</button>
                    <button type="button" className={styles.secondary} onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : (
                  <h2 className={styles.name}>{hero.name}</h2>
                )}
                <p className={styles.meta}>
                  {hero.image_url ? 'Picture from Google Drive' : hero.default_url ? 'Built-in portrait' : 'No picture yet'}
                  {hero.saved_count > 0 ? ` · ${hero.saved_count} save${hero.saved_count === 1 ? '' : 's'} across all cycles` : ''}
                </p>
              </div>
              <div className={styles.toggle}>
                <Switch checked={hero.active} onChange={(v) => setActive(hero, v)} label={`${hero.name}: shown in forms`} onText="Shown in forms" offText="Hidden from forms" />
              </div>
            </div>
            <div className={styles.actions}>
              <div className={styles.order} role="group" aria-label={`Order of ${hero.name}`}>
                <button type="button" className={styles.secondary} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${hero.name} up`}>Up</button>
                <button type="button" className={styles.secondary} disabled={index === heroes.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${hero.name} down`}>Down</button>
              </div>
              <button type="button" className={styles.secondary} aria-expanded={imageFor === hero.key} onClick={() => setImageFor(imageFor === hero.key ? null : hero.key)}>{imageFor === hero.key ? 'Close picture' : hero.image_url ? 'Change picture' : 'Add picture'}</button>
              <button type="button" className={styles.secondary} onClick={() => setRenaming({ key: hero.key, value: hero.name })} disabled={hero.saved_count > 0} aria-describedby={hero.saved_count > 0 ? `why-${hero.key}` : undefined}>Rename</button>
              <button type="button" className={`${styles.secondary} ${styles.danger}`} onClick={() => setRemoveTarget(hero)}>Remove</button>
            </div>
            {hero.saved_count > 0 ? (
              <p className={styles.hint} id={`why-${hero.key}`}>
                {hero.name} can&apos;t be renamed because members saved it and forms remember the name. To change it, add the new name as a new hero and remove or hide this one.
              </p>
            ) : null}
            {rowError[hero.key] ? <p className={styles.error} role="alert">{rowError[hero.key]}</p> : null}
            {imageFor === hero.key ? (
              <div className={styles.imagePanel}>
                <ImageUploadField
                  folder="hero" label={`${hero.name} picture`} altRequired={false} disabled={!driveReady}
                  value={hero.image_url ? { id: hero.image_id, url: hero.image_url, alt: hero.name } : null}
                  onChange={(image) => saveImage(hero, image)}
                />
                {!driveReady ? <p className={styles.error} role="status">Google Drive is not connected, so pictures cannot be uploaded yet. Connect it in Admin &gt; Gallery.</p> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {removed.length ? (
        <details className={styles.restore}>
          <summary>Restore removed heroes ({removed.length})</summary>
          <ul>
            {removed.map((item) => (
              <li key={item.key}>
                <span>{item.name}</span>
                <button type="button" className={styles.secondary} onClick={() => restoreHero(item)} aria-label={`Restore ${item.name}`}>Restore</button>
                {rowError[`restore-${item.key}`] ? <p className={styles.error} role="alert">{rowError[`restore-${item.key}`]}</p> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ConfirmDialog
        open={Boolean(removeTarget)} title={removeTarget ? `Remove ${removeTarget.name}?` : 'Remove this hero?'}
        message={removeTarget ? `Remove ${removeTarget.name}? ${removeTarget.name} will disappear from the KvK and Flamedragon forms. Members who already chose ${removeTarget.name} keep it in their past answers; nothing else is deleted. You can restore it below.` : ''}
        confirmLabel="Remove" onConfirm={confirmRemove} onCancel={() => setRemoveTarget(null)}
      />
    </AdminShell>
  );
}
