'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, pointerWithin, useSensor, useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import GuidePageBody, { GuideMetaFooter } from '../../guides/GuidePageBody';
import guideStyles from '../../guides/guideLayout.module.css';
import {
  BLOCK_LABELS, addBlock, createBlock, duplicateBlock, emptyLayout, findBlock, getTemplate, imagesMissingAlt, layoutBlocks,
  layoutToMarkdown, markdownToLayout, moveBlock, nudgeBlock, removeBlock, slugifyTitle, switchTemplate, updateBlock, validateLayout, collectImages,
} from '../../../lib/guideLayout.mjs';
import { createHistory, pushHistory, redoHistory, replacePresent, undoHistory } from '../../../lib/guideHistory.mjs';
import { BuilderContext } from './BuilderContext';
import AreaDrop, { areaDropId } from './AreaDrop';
import Inspector from './Inspector';
import Palette from './Palette';
import TemplatePicker from './TemplatePicker';
import { checkImageFile, uploadGuideImage, pickGuideImageFromDrive } from './uploadImage';
import AddImageButtons from '../AddImageButtons';
import styles from './builder.module.css';

const META_KEYS = ['title', 'slug', 'category', 'description', 'access_level', 'reviewed_by', 'position', 'f2p_content', 'spender_content'];
const signature = (layout, meta) => JSON.stringify([layout, ...META_KEYS.map(k => meta[k])]);
const AUTO_SLUG = /^untitled-guide(-\d+)?$/;

function collision(args) {
  const hits = pointerWithin(args);
  if (hits.length) {
    const blocks = hits.filter(h => !String(h.id).startsWith('area:'));
    return blocks.length ? blocks : hits;
  }
  return closestCorners(args);
}

function LibraryModal({ library, guideSlug, onPick, onClose }) {
  const [driveError, setDriveError] = useState('');
  const [driveBusy, setDriveBusy] = useState(false);
  async function pickFromDrive(files) {
    if (!files?.[0]) return;
    setDriveBusy(true); setDriveError('');
    try { onPick((await pickGuideImageFromDrive(files[0].id, guideSlug)).src, true); }
    catch (e) { setDriveError(e.message); } finally { setDriveBusy(false); }
  }
  async function uploadHere(files) {
    const file = files?.[0];
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) { setDriveError(problem); return; }
    setDriveBusy(true); setDriveError('');
    try { onPick((await uploadGuideImage(file, guideSlug, () => {})).src, true); }
    catch (e) { setDriveError(e.message); } finally { setDriveBusy(false); }
  }
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.modalBack} role="presentation">
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="lib-title">
        <h2 id="lib-title">Choose an image</h2>
        {library.length ? (
          <div className={styles.libGrid}>
            {library.map(item => (
              <button type="button" key={item.src} className={styles.libItem} onClick={() => onPick(item.src)} aria-label="Use this image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        ) : <p>No images yet. Upload one first.</p>}
        <AddImageButtons busy={driveBusy} error={driveError} onFiles={uploadHere} onPick={pickFromDrive} onError={setDriveError} />
        <div className={styles.modalActions}><button type="button" className={styles.btn} onClick={onClose} autoFocus>Close</button></div>
      </div>
    </div>
  );
}

function useDialogFocus(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('[data-autofocus]')?.focus();
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll('button:not(:disabled), input, select, textarea, a[href]')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [onClose]);
  return ref;
}

function ConfirmDelete({ label, onCancel, onConfirm }) {
  const ref = useDialogFocus(onCancel);
  return (
    <div className={styles.modalBack} role="presentation">
      <div className={`${styles.modal} ${styles.modalSmall}`} role="alertdialog" aria-modal="true" aria-labelledby="del-title" ref={ref}>
        <h2 id="del-title">Delete this {label.toLowerCase()} block?</h2>
        <p className={styles.modalLead}>You can bring it back right after with Undo.</p>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btn} onClick={onCancel} data-autofocus>Keep it</button>
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function TipsCard({ onClose }) {
  const ref = useDialogFocus(onClose);
  return (
    <div className={styles.tips} role="dialog" aria-labelledby="tips-title" ref={ref}>
      <h2 id="tips-title">Welcome! Three quick tips</h2>
      <ol>
        <li><strong>Click any block to edit it.</strong> Type right on the page. Select words to make them bold or add a link.</li>
        <li><strong>Drag the ⠿ handle to move a block.</strong> Or use the arrow buttons and the &quot;part of the page&quot; menu on the block.</li>
        <li><strong>Add blocks from the left.</strong> Or press the + between blocks. Your work saves by itself.</li>
      </ol>
      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose} data-autofocus>Got it</button>
    </div>
  );
}

function CheckItem({ ok, children }) {
  return <li data-ok={ok ? 'true' : 'false'}><span aria-hidden="true">{ok ? '✓' : '✕'}</span> <span className={styles.srOnly}>{ok ? 'Done: ' : 'To do: '}</span>{children}</li>;
}

function PublishDialog({ meta, layout, busy, onAccess, onTitle, onCancel, onFixPictures, onPublish }) {
  const ref = useDialogFocus(onCancel);
  const missing = imagesMissingAlt(layout).length;
  const titled = Boolean(meta.title.trim()) && !/^untitled guide$/i.test(meta.title.trim());
  const hasContent = layoutBlocks(layout).length > 0;
  const ready = titled && hasContent && missing === 0;
  return (
    <div className={styles.modalBack} role="presentation">
      <div className={`${styles.modal} ${styles.modalSmall}`} role="dialog" aria-modal="true" aria-labelledby="pub-title" ref={ref}>
        <h2 id="pub-title">Ready to publish?</h2>
        <p className={styles.modalLead}>Quick check before readers see this page at /guides/{meta.slug}.</p>
        <ul className={styles.checklist}>
          <CheckItem ok={titled}>{titled ? 'The guide has a title' : 'Give the guide a title'}</CheckItem>
          <CheckItem ok={hasContent}>{hasContent ? 'The page has content' : 'Add at least one block'}</CheckItem>
          <CheckItem ok={missing === 0}>{missing === 0 ? 'Every picture has a description (alt text)' : `${missing} picture${missing > 1 ? 's still need a description' : ' still needs a description'}`}</CheckItem>
        </ul>
        {!titled ? (
          <label className={styles.mini} style={{ marginTop: 10 }}><span>Title</span>
            <input value={meta.title} maxLength={180} onChange={e => onTitle(e.target.value)} data-autofocus />
          </label>
        ) : null}
        <label className={styles.mini} style={{ marginTop: 12 }}><span>Who can read it</span>
          <select value={meta.access_level} onChange={e => onAccess(e.target.value)}>
            <option value="public">Public: anyone with the link</option>
            <option value="members">Members only: signed-in members</option>
          </select>
        </label>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btn} onClick={onCancel}>Keep editing</button>
          {missing ? <button type="button" className={styles.btn} onClick={onFixPictures}>Fix pictures</button> : null}
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!ready || busy} onClick={onPublish} data-autofocus={titled ? true : undefined}>Publish now</button>
        </div>
      </div>
    </div>
  );
}

export default function GuideBuilder({ slug: initialSlug }) {
  const router = useRouter();
  const [phase, setPhase] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [history, setHistory] = useState(null);
  const [meta, setMeta] = useState(null);
  const [slugKey, setSlugKey] = useState(initialSlug);
  const [slugAuto, setSlugAuto] = useState(false);
  const [categories, setCategories] = useState([]);
  const [library, setLibrary] = useState([]);
  const [libraryError, setLibraryError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [focusAlt, setFocusAlt] = useState(null);
  const [preview, setPreview] = useState(false);
  const [picker, setPicker] = useState(null); // 'first' | 'switch' | null
  const [libraryPicker, setLibraryPicker] = useState(null);
  const [paletteTab, setPaletteTab] = useState('blocks');
  const [uploads, setUploads] = useState({});
  const [notice, setNotice] = useState(null);
  const [savedSig, setSavedSig] = useState('');
  const [liveSig, setLiveSig] = useState(null);
  const [saveState, setSaveState] = useState('saved'); // saved | dirty | saving | error
  const [retry, setRetry] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [restored, setRestored] = useState(false);
  const [converted, setConverted] = useState(false);
  const [dragLayout, setDragLayout] = useState(null);
  const [active, setActive] = useState(null);
  const [fileDrag, setFileDrag] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const [publishDialog, setPublishDialog] = useState(false);
  const [tips, setTips] = useState(false);
  const [drawer, setDrawer] = useState(null); // 'blocks' | 'settings' | null (narrow windows)

  const rootRef = useRef(null);
  const headerRef = useRef(null);
  const fileRef = useRef(null);
  const uploadTarget = useRef(null);
  const lastKey = useRef(null);
  const lastTime = useRef(0);
  const latest = useRef({});

  const layout = history?.present || null;
  const shownLayout = dragLayout || layout;
  const template = getTemplate(layout?.template) || getTemplate('article');

  // ---------------------------------------------------------------- load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin-guides/${encodeURIComponent(initialSlug)}`, { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 401 ? 'Your admin session expired. Sign in again.' : body.error || 'Unable to load this guide.');
        if (cancelled) return;
        const g = body.guide;
        const src = g.draft ? { ...g, ...g.draft } : g;
        let nextLayout = src.layout ? validateLayout(src.layout).layout || null : null;
        let wasConverted = false;
        if (!nextLayout && (g.body || '').trim()) { nextLayout = markdownToLayout(g.body); wasConverted = true; }
        const nextMeta = {
          title: src.title || '', slug: src.slug || g.slug, category: src.category || '', description: src.description || '',
          access_level: src.access_level || 'public', reviewed_by: src.reviewed_by || '', position: String(src.position ?? 0),
          f2p_content: src.f2p_content || '', spender_content: src.spender_content || '', is_published: Boolean(g.is_published),
        };
        const liveLayout = g.layout ? validateLayout(g.layout).layout : null;
        setMeta(nextMeta);
        setSlugKey(g.slug);
        setSlugAuto(AUTO_SLUG.test(nextMeta.slug));
        setHistory(createHistory(nextLayout));
        setSavedSig(signature(nextLayout, nextMeta));
        setLiveSig(liveLayout ? signature(liveLayout, { ...g, position: String(g.position ?? 0) }) : null);
        setRestored(Boolean(g.draft));
        setConverted(wasConverted);
        setPicker(nextLayout ? null : 'first');
        setPhase('ready');
      } catch (err) {
        if (!cancelled) { setLoadError(err.message || 'Unable to load this guide.'); setPhase('error'); }
      }
    })();
    fetch('/api/admin-guide-categories', { cache: 'no-store' }).then(r => r.json()).then(r => { if (!cancelled) setCategories((r.categories || []).map(c => c.name)); }).catch(() => {});
    fetch(`/api/admin-guide-images?guide=${encodeURIComponent(initialSlug)}`, { cache: 'no-store' }).then(r => r.json()).then(r => { if (!cancelled) setLibrary(r.images || []); }).catch(() => { if (!cancelled) setLibraryError('The image library could not be loaded.'); });
    return () => { cancelled = true; };
  }, [initialSlug]);

  // Header height drives the sticky side panels.
  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === 'undefined') return undefined;
    const apply = () => rootRef.current?.style.setProperty('--hdr', `${header.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(header);
    return () => ro.disconnect();
  }, [phase]);

  // Images used on the page also belong in the library.
  const fullLibrary = useMemo(() => {
    const seen = new Set(library.map(i => i.src));
    const used = layout ? collectImages(layout).filter(s => !seen.has(s)).map(src => ({ src })) : [];
    return [...library, ...used];
  }, [library, layout]);

  // ---------------------------------------------------------------- history
  const commit = useCallback((fn, key) => {
    const now = Date.now();
    const coalesce = Boolean(key) && key === lastKey.current && now - lastTime.current < 1200;
    lastKey.current = key || null;
    lastTime.current = now;
    setHistory(h => {
      const next = fn(h.present);
      if (next === h.present) return h;
      return coalesce ? replacePresent(h, next) : pushHistory(h, next);
    });
  }, []);

  const undo = useCallback(() => { lastKey.current = null; setHistory(h => undoHistory(h)); }, []);
  const redo = useCallback(() => { lastKey.current = null; setHistory(h => redoHistory(h)); }, []);

  useEffect(() => {
    const onKey = e => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ---------------------------------------------------------------- autosave (draft)
  const sig = layout && meta ? signature(layout, meta) : '';
  const draftBody = useCallback((l, m) => JSON.stringify({ layout: l, ...Object.fromEntries(META_KEYS.map(k => [k, m[k]])) }), []);
  useEffect(() => { latest.current = { layout, meta, sig, savedSig, slugKey }; });

  useEffect(() => {
    if (phase !== 'ready' || !layout || !meta) return undefined;
    if (sig === savedSig) { if (saveState !== 'saving') setSaveState('saved'); return undefined; }
    if (saveState === 'saving') return undefined;
    if (saveState !== 'error') setSaveState('dirty');
    const timer = setTimeout(async () => {
      const sentSig = sig;
      setSaveState('saving');
      try {
        const res = await fetch(`/api/admin-guides/${encodeURIComponent(slugKey)}/draft`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: draftBody(layout, meta) });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Draft could not be saved.');
        }
        setSavedSig(sentSig);
        setSaveState('saved');
      } catch (err) {
        setSaveState('error');
        setNotice({ kind: 'error', text: `Autosave failed: ${err.message} Retrying…` });
        setTimeout(() => setRetry(n => n + 1), 5000);
      }
    }, saveState === 'error' ? 100 : 2500);
    return () => clearTimeout(timer);
  }, [sig, savedSig, saveState, phase, layout, meta, slugKey, draftBody, retry]);

  // Last-chance save when the tab closes or the builder unmounts.
  useEffect(() => {
    const flush = () => {
      const { layout: l, meta: m, sig: s, savedSig: saved, slugKey: key } = latest.current;
      if (!l || !m || s === saved) return;
      try { fetch(`/api/admin-guides/${encodeURIComponent(key)}/draft`, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: draftBody(l, m) }); } catch { /* best effort */ }
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide); flush(); };
  }, [draftBody]);

  // ---------------------------------------------------------------- publish / save
  const commitLive = useCallback(async ({ publish, exit = false } = {}) => {
    if (!layout || !meta) return;
    const willPublish = publish === undefined ? meta.is_published : publish;
    if (willPublish) {
      const missing = imagesMissingAlt(layout);
      if (missing.length) {
        setPreview(false);
        setSelectedId(missing[0]);
        setFocusAlt(null);
        setTimeout(() => setFocusAlt(missing[0]), 60);
        setNotice({ kind: 'error', text: `Add alt text (or mark as decorative) for ${missing.length} image${missing.length > 1 ? 's' : ''} before publishing. The first one is selected.` });
        return;
      }
    }
    setCommitting(true);
    setNotice(null);
    try {
      const payload = { ...meta, is_published: willPublish, position: Number(meta.position), layout };
      const res = await fetch(`/api/admin-guides/${encodeURIComponent(slugKey)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Unable to save this guide.');
      const saved = body.guide;
      setMeta(m => ({ ...m, is_published: Boolean(saved.is_published), slug: saved.slug }));
      setSlugKey(saved.slug);
      if (saved.slug !== slugKey) window.history.replaceState(null, '', `/admin/dashboard/guides/${saved.slug}`);
      const newSig = signature(layout, { ...meta, slug: saved.slug });
      setSavedSig(newSig);
      setLiveSig(newSig);
      setSaveState('saved');
      setRestored(false);
      setNotice({ kind: 'ok', text: willPublish ? (meta.is_published ? 'Live page updated.' : 'Published. The page is now live.') : (publish === false ? 'Unpublished. The page is now a draft.' : 'Saved.') });
      if (exit) router.push('/admin/dashboard/guides');
    } catch (err) {
      setNotice({ kind: 'error', text: err.message });
    } finally {
      setCommitting(false);
    }
  }, [layout, meta, slugKey, router]);

  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); commitLive({}); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commitLive]);

  // ---------------------------------------------------------------- meta
  const setMetaField = (field, value) => setMeta(m => {
    const next = { ...m, [field]: value };
    if (field === 'title' && slugAuto) next.slug = slugifyTitle(value) || m.slug;
    return next;
  });

  // ---------------------------------------------------------------- block actions
  const mainAreaId = useMemo(() => (template.areas.find(a => a.role === 'main') || template.areas[0]).id, [template]);

  const insertBlock = useCallback((block, areaId, index) => {
    commit(l => addBlock(l, areaId, block, index));
    setSelectedId(block.id);
  }, [commit]);

  const defaultTarget = useCallback(() => {
    const sel = layout && selectedId ? findBlock(layout, selectedId) : null;
    return sel ? { areaId: sel.areaId, index: sel.index + 1 } : { areaId: mainAreaId, index: undefined };
  }, [layout, selectedId, mainAreaId]);

  const startFileUpload = useCallback(async (files, target) => {
    setNotice(null);
    let list = files.filter(Boolean);
    let current = layout;
    const targetBlock = target?.blockId && layout ? findBlock(layout, target.blockId) : null;
    if (targetBlock?.block.type === 'imagegrid') {
      const room = 4 - targetBlock.block.images.length + (target.index != null && target.index < targetBlock.block.images.length ? 1 : 0);
      if (list.length > room) {
        setNotice({ kind: 'error', text: room > 0 ? `An image grid holds 4 pictures. Only the first ${room} file${room > 1 ? 's were' : ' was'} added.` : 'This image grid is full (4 pictures). Remove one first.' });
        list = list.slice(0, Math.max(room, 0));
      }
    }
    for (const file of list) {
      const problem = file.driveId ? '' : checkImageFile(file);
      if (problem) { setNotice({ kind: 'error', text: problem }); continue; }
      let key = target?.blockId || null;
      let gridIndex = target?.index ?? null;
      if (!key) {
        const block = createBlock('image');
        const at = target?.areaId ? { areaId: target.areaId, index: target.atIndex } : defaultTarget();
        current = addBlock(current, at.areaId, block, at.index);
        commit(l => addBlock(l, at.areaId, block, at.index));
        key = block.id;
        setSelectedId(block.id);
      }
      setUploads(u => ({ ...u, [key]: { name: file.name, progress: 0 } }));
      try {
        const { src } = file.driveId
          ? await pickGuideImageFromDrive(file.driveId, latest.current.slugKey || slugKey)
          : await uploadGuideImage(file, latest.current.slugKey || slugKey, p => setUploads(u => ({ ...u, [key]: { name: file.name, progress: p } })));
        setLibrary(lib => [{ src }, ...lib.filter(i => i.src !== src)]);
        commit(l => {
          const found = findBlock(l, key);
          if (!found) return l;
          if (found.block.type === 'imagegrid') {
            const images = [...found.block.images];
            const item = { src, alt: '', decorative: false };
            if (gridIndex != null && gridIndex < images.length) images[gridIndex] = item; else if (images.length < 4) images.push(item); else return l;
            return updateBlock(l, key, { images });
          }
          return updateBlock(l, key, { src, alt: found.block.src ? found.block.alt : '', decorative: false });
        });
        setUploads(u => { const { [key]: _gone, ...rest } = u; return rest; });
        setFocusAlt(key);
        setSelectedId(key);
        gridIndex = null;
      } catch (err) {
        setUploads(u => ({ ...u, [key]: { name: file.name, progress: 0, error: err.message } }));
        setNotice({ kind: 'error', text: err.message });
      }
    }
  }, [layout, commit, defaultTarget, slugKey]);

  const requestUpload = useCallback((blockId, index, files) => {
    if (files?.length) { startFileUpload(files, { blockId, index }); return; }
    uploadTarget.current = { blockId, index };
    // Several files at once for the page and for image grids; one for a single picture.
    if (fileRef.current) { fileRef.current.multiple = !blockId || index != null; fileRef.current.click(); }
  }, [startFileUpload]);

  // Same flow as a file upload, but the picture comes from the Google Picker (copied into Drive by the server).
  const requestDrivePick = useCallback((blockId, index, picks) => {
    const items = (picks || []).map(p => ({ driveId: p.id, name: p.name || 'Picture from Drive' }));
    if (items.length) startFileUpload(items, { blockId, index });
  }, [startFileUpload]);

  const actions = useMemo(() => ({
    requestRemove: id => setConfirmDelete(id),
    remove: id => {
      commit(l => removeBlock(l, id));
      setSelectedId(null);
      setConfirmDelete(null);
      setToast({ text: 'Block deleted.', undo: true, at: Date.now() });
    },
    areaOf: id => (layout ? findBlock(layout, id)?.areaId : null),
    indexOf: id => (layout ? findBlock(layout, id)?.index ?? 0 : 0),
    addAt: (type, areaId, index) => insertBlock(createBlock(type), areaId, index),
    openSettings: () => setDrawer('settings'),
    showTips: () => setTips(true),
    nudge: (id, dir) => commit(l => nudgeBlock(l, id, dir)),
    moveToArea: (id, areaId) => commit(l => moveBlock(l, id, areaId, null)),
    duplicate: id => {
      if (!layout) return;
      const out = duplicateBlock(layout, id);
      if (out.id) { commit(() => out.layout); setSelectedId(out.id); }
    },
    addFromPalette: type => {
      setDrawer(null);
      const block = createBlock(type);
      const at = defaultTarget();
      insertBlock(block, at.areaId, at.index);
    },
    addImage: src => {
      setDrawer(null);
      const block = { ...createBlock('image'), src };
      const at = defaultTarget();
      insertBlock(block, at.areaId, at.index);
      setFocusAlt(block.id);
    },
    openTemplates: () => setPicker('switch'),
  }), [commit, layout, defaultTarget, insertBlock]);

  // Undo toast lasts a few seconds.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  // First visit: show the three quick tips once.
  useEffect(() => {
    try { if (!localStorage.getItem('k710-guide-builder-tips-v1')) setTips(true); } catch { setTips(true); }
  }, []);
  const closeTips = () => {
    setTips(false);
    try { localStorage.setItem('k710-guide-builder-tips-v1', '1'); } catch { /* ignore */ }
  };

  const applyLibraryImage = src => {
    const target = libraryPicker;
    setLibraryPicker(null);
    if (!target) return;
    if (!target.blockId) { actions.addImage(src); return; }
    commit(l => {
      const found = findBlock(l, target.blockId);
      if (!found) return l;
      if (found.block.type === 'imagegrid') {
        const images = [...found.block.images];
        const item = { src, alt: '', decorative: false };
        if (target.index != null && target.index < images.length) images[target.index] = item; else if (images.length < 4) images.push(item); else return l;
        return updateBlock(l, target.blockId, { images });
      }
      return updateBlock(l, target.blockId, { src, alt: found.block.src === src ? found.block.alt : '' });
    });
    setFocusAlt(target.blockId);
  };

  const ctx = useMemo(() => ({
    selectedId, select: setSelectedId, update: (id, patch, key) => commit(l => updateBlock(l, id, patch), key),
    actions, areas: template.areas, template, uploads, requestUpload, requestDrivePick, openLibrary: (blockId, index) => setLibraryPicker({ blockId, index }),
    focusAlt, libraryError, anchors: {},
  }), [selectedId, commit, actions, template, uploads, requestUpload, requestDrivePick, focusAlt, libraryError]);

  // ---------------------------------------------------------------- drag and drop
  const sensors = useSensors(
    // Mouse and trackpad: a 6px move before a drag starts, so clicks and tiny
    // slips never move a block. Touch: press and hold briefly (150ms) so a
    // normal swipe still scrolls the page. Keyboard: Space on the handle, then
    // the arrow keys.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = ({ active: a }) => {
    setActive({ id: a.id, data: a.data.current });
    if (a.data.current?.kind === 'block') setDragLayout(layout);
  };

  const resolveOver = (l, over, activeRect) => {
    if (!over) return null;
    const overId = String(over.id);
    if (overId.startsWith('area:')) return { areaId: overId.slice(5), index: l.areas[overId.slice(5)].length };
    const found = findBlock(l, overId);
    if (!found) return null;
    const below = activeRect && over.rect && activeRect.top + activeRect.height / 2 > over.rect.top + over.rect.height / 2;
    return { areaId: found.areaId, index: found.index + (below ? 1 : 0), overIndex: found.index };
  };

  // Crossing into another area re-measures the layout, which can fire another
  // drag-over straight away (and bounce the block back and forth). One move per
  // animation frame keeps that from becoming an update loop.
  const justMoved = useRef(false);
  const onDragOver = ({ active: a, over }) => {
    if (a.data.current?.kind !== 'block' || !dragLayout || justMoved.current) return;
    const from = findBlock(dragLayout, a.id);
    const to = resolveOver(dragLayout, over, a.rect.current.translated);
    if (!from || !to || from.areaId === to.areaId) return;
    justMoved.current = true;
    requestAnimationFrame(() => { justMoved.current = false; });
    setDragLayout(moveBlock(dragLayout, String(a.id), to.areaId, to.index));
  };

  const onDragEnd = ({ active: a, over }) => {
    const data = a.data.current;
    setActive(null);
    if (data?.kind === 'block') {
      let next = dragLayout || layout;
      const from = findBlock(next, a.id);
      const to = resolveOver(next, over, null);
      if (from && to && from.areaId === to.areaId && to.overIndex != null && to.overIndex !== from.index) {
        next = moveBlock(next, String(a.id), to.areaId, to.overIndex);
      }
      setDragLayout(null);
      if (next !== layout) { lastKey.current = null; commit(() => next); }
      return;
    }
    setDragLayout(null);
    if (!over) return;
    const to = resolveOver(layout, over, a.rect.current.translated);
    if (!to) return;
    const block = data?.kind === 'palette' ? createBlock(data.type) : { ...createBlock('image'), src: data?.src };
    insertBlock(block, to.areaId, to.index);
    if (data?.kind === 'image') setFocusAlt(block.id);
  };

  const onDragCancel = () => { setActive(null); setDragLayout(null); };

  // OS file drops anywhere on the canvas.
  const onCanvasDragOver = e => {
    if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setFileDrag(true); }
  };
  const onCanvasDrop = e => {
    setFileDrag(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    const blockEl = e.target.closest?.('[data-block-id]');
    const areaEl = e.target.closest?.('[data-area-drop]');
    const blockId = blockEl?.dataset.blockId;
    const found = blockId ? findBlock(layout, blockId) : null;
    if (found && (found.block.type === 'image' || found.block.type === 'imagegrid')) {
      startFileUpload(files.slice(0, found.block.type === 'image' ? 1 : files.length), { blockId, index: null });
    } else if (found) {
      startFileUpload(files, { areaId: found.areaId, atIndex: found.index + 1 });
    } else {
      startFileUpload(files, { areaId: areaEl?.dataset.areaDrop || mainAreaId });
    }
  };

  // ---------------------------------------------------------------- template
  const pickTemplate = id => {
    if (picker === 'first' || !layout) {
      setHistory(createHistory(emptyLayout(id)));
      setSavedSig('');
    } else if (id !== layout.template) {
      commit(l => switchTemplate(l, id));
    }
    setPicker(null);
  };

  // ---------------------------------------------------------------- render
  if (phase === 'loading') return <div className={styles.root}><p className={styles.loading} role="status">Loading the page builder…</p></div>;
  if (phase === 'error') {
    return (
      <div className={styles.root}>
        <div className={styles.loading}>
          <p role="alert">{loadError}</p>
          <Link className={styles.btn} href="/admin/dashboard/guides">Back to guides</Link>
        </div>
      </div>
    );
  }

  const selected = layout && selectedId ? findBlock(layout, selectedId) : null;
  const blockCount = layoutBlocks(layout || { template: 'article', areas: {} }).length;
  const differsFromLive = liveSig === null || sig !== liveSig;
  const statusText = { saved: 'Saved', dirty: 'Changes not saved yet', saving: 'Saving…', error: 'Could not save. Trying again…' }[saveState];
  const previewGuide = layout ? { ...meta, slug: meta.slug, layout, body: layoutToMarkdown(layout), updated_at: new Date().toISOString() } : null;
  const dragBlock = active?.data?.kind === 'block' ? findBlock(shownLayout, active.id) : null;
  const publicHref = `/guides/${meta.slug}`;

  return (
    <BuilderContext.Provider value={ctx}>
      <div className={styles.root} ref={rootRef} data-builder-root>
        <header className={styles.header} ref={headerRef}>
          <div className={styles.headRow}>
            <Link className={styles.back} href="/admin/dashboard/guides">← Guides</Link>
            <label className={styles.titleField}>
              <span className={styles.srOnly}>Guide title</span>
              <input value={meta.title} maxLength={180} placeholder="Guide title" onChange={e => setMetaField('title', e.target.value)} />
            </label>
            <span className={styles.status} data-state={saveState} role="status" aria-live="polite">{saveState === 'saved' ? '✓ ' : ''}{statusText}</span>
            <div className={styles.headTools}>
              <button type="button" className={`${styles.btn} ${styles.drawerBtn}`} onClick={() => setDrawer(d => (d === 'blocks' ? null : 'blocks'))} aria-expanded={drawer === 'blocks'}>Blocks</button>
              <button type="button" className={`${styles.btn} ${styles.drawerBtn}`} onClick={() => setDrawer(d => (d === 'settings' ? null : 'settings'))} aria-expanded={drawer === 'settings'}>Settings</button>
              <button type="button" className={styles.btn} onClick={undo} disabled={!history.past.length} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">Undo</button>
              <button type="button" className={styles.btn} onClick={redo} disabled={!history.future.length} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">Redo</button>
              <button type="button" className={styles.btn} aria-pressed={preview} onClick={() => { setPreview(p => !p); setSelectedId(null); }}>{preview ? 'Back to editing' : 'Preview'}</button>
              <button type="button" className={styles.btn} onClick={() => setTips(true)} title="Quick tips" aria-label="Show quick tips">?</button>
              <a className={styles.btn} href={publicHref} target="_blank" rel="noopener noreferrer">Open public page</a>
            </div>
            <div className={styles.headTools}>
              <button type="button" className={styles.btn} onClick={() => commitLive({})} disabled={committing} title="Save (Ctrl/Cmd+S)">{meta.is_published ? 'Update live page' : 'Save draft'}</button>
              {meta.is_published
                ? <button type="button" className={styles.btn} onClick={() => commitLive({ publish: false })} disabled={committing}>Unpublish</button>
                : <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setPublishDialog(true)} disabled={committing}>Publish…</button>}
              <button type="button" className={styles.btn} onClick={() => commitLive({ exit: true })} disabled={committing}>Save and exit</button>
            </div>
          </div>
          <div className={styles.headRow2}>
            <label className={styles.mini}><span>URL</span>
              <span className={styles.slugWrap}>/guides/<input value={meta.slug} maxLength={80} aria-label="Guide URL slug" onChange={e => { setSlugAuto(false); setMetaField('slug', e.target.value.toLowerCase()); }} /></span>
            </label>
            <label className={styles.mini}><span>Category</span>
              <input list="gb-cats" value={meta.category} maxLength={80} onChange={e => setMetaField('category', e.target.value)} />
            </label>
            <datalist id="gb-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
            <label className={styles.mini}><span>Who can read it</span>
              <select value={meta.access_level} onChange={e => setMetaField('access_level', e.target.value)}>
                <option value="public">Public</option><option value="members">Members only</option>
              </select>
            </label>
            <span className={styles.badge} data-live={meta.is_published ? 'true' : 'false'}>{meta.is_published ? 'Published' : 'Draft'}{meta.is_published && differsFromLive ? ' · changes not live yet' : ''}</span>
            <button type="button" className={styles.btn} onClick={() => setPicker('switch')}>Template: {template.name}</button>
            <button type="button" className={styles.btn} aria-expanded={showDetails} onClick={() => setShowDetails(v => !v)}>{showDetails ? 'Hide details' : 'More details'}</button>
          </div>
          {showDetails ? (
            <div className={styles.details}>
              <label className={styles.mini} style={{ flex: '2 1 320px' }}><span>Short description (search results and link previews)</span>
                <textarea rows={2} maxLength={500} value={meta.description} onChange={e => setMetaField('description', e.target.value)} />
              </label>
              <label className={styles.mini}><span>Last reviewed by</span><input value={meta.reviewed_by} maxLength={80} onChange={e => setMetaField('reviewed_by', e.target.value)} /></label>
              <label className={styles.mini}><span>Library position</span><input type="number" min="0" max="100000" value={meta.position} onChange={e => setMetaField('position', e.target.value)} /></label>
              <label className={styles.mini} style={{ flex: '1 1 280px' }}><span>F2P tab (optional markdown, shown under the page)</span>
                <textarea rows={3} value={meta.f2p_content} onChange={e => setMetaField('f2p_content', e.target.value)} />
              </label>
              <label className={styles.mini} style={{ flex: '1 1 280px' }}><span>Spender tab (optional markdown)</span>
                <textarea rows={3} value={meta.spender_content} onChange={e => setMetaField('spender_content', e.target.value)} />
              </label>
            </div>
          ) : null}
        </header>

        {notice ? (
          <div className={styles.notice} data-kind={notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">✕</button>
          </div>
        ) : null}
        {restored ? <div className={styles.notice} data-kind="info" role="status"><span>Restored your autosaved draft. It is not live until you save or publish.</span><button type="button" onClick={() => setRestored(false)} aria-label="Dismiss message">✕</button></div> : null}
        {converted ? <div className={styles.notice} data-kind="info" role="status"><span>This classic guide was converted into blocks. Nothing changes on the public page until you save.</span><button type="button" onClick={() => setConverted(false)} aria-label="Dismiss message">✕</button></div> : null}

        <div className={styles.mobileNotice}>
          <h2>Edit on a larger screen</h2>
          <p>The page builder needs a tablet or desktop-width window. Your guide is safe - autosaved drafts and the public page still work.</p>
          <div className={styles.inline}>
            <a className={styles.btn} href={publicHref} target="_blank" rel="noopener noreferrer">Open public page</a>
            <Link className={styles.btn} href="/admin/dashboard/guides">Back to guides</Link>
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className={styles.srOnly} tabIndex={-1} aria-hidden="true"
          onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) startFileUpload(files, uploadTarget.current || {}); }} />

        {layout ? (
          <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
            <div className={styles.workspace} data-drawer={drawer || undefined}>
              {drawer ? <button type="button" className={styles.drawerScrim} aria-label="Close panel" onClick={() => setDrawer(null)} /> : null}
              <aside className={styles.left} aria-label="Blocks and images" data-open={drawer === 'blocks' ? 'true' : undefined}>
                <Palette library={fullLibrary} uploads={uploads} tab={paletteTab} setTab={setPaletteTab} />
              </aside>

              <div className={styles.canvasCol} onClick={e => { if (!e.target.closest('[data-block-id]') && !e.target.closest('[role="menu"]')) setSelectedId(null); }}>
                <div className="site-shell-realm">
                  {preview ? (
                    <main className={`armory guide-page ${guideStyles.page}`} aria-label="Guide preview">
                      <div className={`guide-inner ${guideStyles.inner}`}>
                        <GuidePageBody guide={previewGuide} />
                        <GuideMetaFooter guide={previewGuide} />
                      </div>
                    </main>
                  ) : (
                    <div
                      className={styles.canvas}
                      data-file-drag={fileDrag ? 'true' : undefined}
                      onDragOver={onCanvasDragOver}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFileDrag(false); }}
                      onDrop={onCanvasDrop}
                    >
                      <main className={`armory guide-page ${guideStyles.page}`} aria-label="Guide page editor">
                        <div className={`guide-inner ${guideStyles.inner}`}>
                          <GuidePageBody
                            guide={{ ...meta, layout: shownLayout, body: '' }}
                            editing
                            renderArea={area => <AreaDrop area={area} blocks={shownLayout.areas[area.id] || []} activeKind={active?.data?.kind} />}
                          />
                          {blockCount === 0 ? <p className={styles.canvasHint}>Start with a block from the left panel, press &quot;Add block&quot; below, or drop pictures straight onto the page.</p> : null}
                        </div>
                      </main>
                      {fileDrag ? <div className={styles.fileOverlay} aria-hidden="true">Drop images to add them</div> : null}
                    </div>
                  )}
                </div>
              </div>

              <aside className={styles.right} aria-label="Block settings" data-open={drawer === 'settings' ? 'true' : undefined}>
                {preview ? <div className={styles.inspEmpty}><h2>Preview</h2><p>This is the public page exactly as readers see it. Switch back to keep editing.</p></div>
                  : <Inspector block={selected?.block || null} areaId={selected?.areaId} />}
              </aside>
            </div>

            <DragOverlay dropAnimation={null}>
              {active ? (
                <div className={styles.dragGhost}>
                  {active.data?.kind === 'palette' ? `New ${BLOCK_LABELS[active.data.type]}` : active.data?.kind === 'image'
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={active.data.src} alt="" />
                    : dragBlock ? `${BLOCK_LABELS[dragBlock.block.type]} block` : 'Block'}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : null}

        {toast ? (
          <div className={styles.toast} role="status">
            <span>{toast.text}</span>
            {toast.undo ? <button type="button" className={styles.btn} onClick={() => { undo(); setToast(null); }}>Undo</button> : null}
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>✕</button>
          </div>
        ) : null}
        {tips && !picker ? <TipsCard onClose={closeTips} /> : null}
        {confirmDelete ? (
          <ConfirmDelete
            label={BLOCK_LABELS[findBlock(layout, confirmDelete)?.block.type] || 'block'}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => actions.remove(confirmDelete)}
          />
        ) : null}
        {publishDialog ? (
          <PublishDialog
            meta={meta}
            layout={layout}
            busy={committing}
            onAccess={v => setMetaField('access_level', v)}
            onTitle={v => setMetaField('title', v)}
            onCancel={() => setPublishDialog(false)}
            onFixPictures={() => { const first = imagesMissingAlt(layout)[0]; setPublishDialog(false); setPreview(false); setSelectedId(first); setFocusAlt(null); setTimeout(() => setFocusAlt(first), 60); }}
            onPublish={async () => { await commitLive({ publish: true }); setPublishDialog(false); }}
          />
        ) : null}
        {picker ? <TemplatePicker first={picker === 'first'} current={layout?.template} onPick={pickTemplate} onClose={picker === 'switch' ? () => setPicker(null) : undefined} /> : null}
        {libraryPicker ? <LibraryModal library={fullLibrary} guideSlug={latest.current.slugKey || slugKey} onPick={(src, isNew) => { if (isNew) setLibrary(lib => [{ src }, ...lib.filter(i => i.src !== src)]); applyLibraryImage(src); }} onClose={() => setLibraryPicker(null)} /> : null}
      </div>
    </BuilderContext.Provider>
  );
}
