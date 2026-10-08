'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, pointerWithin, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import GuidePageBody, { GuideMetaFooter } from '../../guides/GuidePageBody';
import guideStyles from '../../guides/guideLayout.module.css';
import {
  BLOCK_LABELS, addBlock, createBlock, duplicateBlock, emptyLayout, findBlock, getTemplate, imagesMissingAlt, layoutBlocks,
  layoutToMarkdown, markdownToLayout, moveBlock, nudgeBlock, removeBlock, slugifyTitle, switchTemplate, updateBlock, validateLayout, collectImages,
} from '../../../lib/guideLayout.mjs';
import { createHistory, pushHistory, redoHistory, replacePresent, undoHistory } from '../../../lib/guideHistory.mjs';
import { BuilderContext } from './BuilderContext';
import SortableBlock from './BlockEditors';
import Inspector from './Inspector';
import Palette from './Palette';
import TemplatePicker from './TemplatePicker';
import { checkImageFile, uploadGuideImage } from './uploadImage';
import styles from './builder.module.css';

const META_KEYS = ['title', 'slug', 'category', 'description', 'access_level', 'reviewed_by', 'position', 'f2p_content', 'spender_content'];
const signature = (layout, meta) => JSON.stringify([layout, ...META_KEYS.map(k => meta[k])]);
const AUTO_SLUG = /^untitled-guide(-\d+)?$/;
const areaDropId = id => `area:${id}`;

function collision(args) {
  const hits = pointerWithin(args);
  if (hits.length) {
    const blocks = hits.filter(h => !String(h.id).startsWith('area:'));
    return blocks.length ? blocks : hits;
  }
  return closestCorners(args);
}

function AreaDrop({ area, blocks, activeKind }) {
  const { setNodeRef, isOver } = useDroppable({ id: areaDropId(area.id), data: { kind: 'area', areaId: area.id } });
  return (
    <section
      ref={setNodeRef}
      className={styles.areaShell}
      data-area-drop={area.id}
      data-over={isOver ? 'true' : undefined}
      data-armed={activeKind ? 'true' : undefined}
      aria-label={`${area.label} area`}
    >
      <span className={styles.areaLabel}>{area.label}</span>
      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map((block, index) => <SortableBlock key={block.id} block={block} index={index} areaId={area.id} />)}
      </SortableContext>
      {blocks.length === 0 ? <p className={styles.areaEmpty}>Empty - drag a block here, or click a block in the left panel.</p> : null}
    </section>
  );
}

function LibraryModal({ library, onPick, onClose }) {
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
        <div className={styles.modalActions}><button type="button" className={styles.btn} onClick={onClose} autoFocus>Close</button></div>
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
        setFocusAlt(missing[0]);
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
    const list = files.filter(Boolean);
    let current = layout;
    for (const file of list) {
      const problem = checkImageFile(file);
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
        const { src } = await uploadGuideImage(file, latest.current.slugKey || slugKey, p => setUploads(u => ({ ...u, [key]: { name: file.name, progress: p } })));
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
    if (fileRef.current) { fileRef.current.multiple = !blockId; fileRef.current.click(); }
  }, [startFileUpload]);

  const actions = useMemo(() => ({
    remove: id => { commit(l => removeBlock(l, id)); setSelectedId(null); },
    nudge: (id, dir) => commit(l => nudgeBlock(l, id, dir)),
    moveToArea: (id, areaId) => commit(l => moveBlock(l, id, areaId, null)),
    duplicate: id => {
      if (!layout) return;
      const out = duplicateBlock(layout, id);
      if (out.id) { commit(() => out.layout); setSelectedId(out.id); }
    },
    addFromPalette: type => {
      const block = createBlock(type);
      const at = defaultTarget();
      insertBlock(block, at.areaId, at.index);
    },
    addImage: src => {
      const block = { ...createBlock('image'), src };
      const at = defaultTarget();
      insertBlock(block, at.areaId, at.index);
      setFocusAlt(block.id);
    },
    openTemplates: () => setPicker('switch'),
  }), [commit, layout, defaultTarget, insertBlock]);

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
    actions, areas: template.areas, template, uploads, requestUpload, openLibrary: (blockId, index) => setLibraryPicker({ blockId, index }),
    focusAlt, libraryError, anchors: {},
  }), [selectedId, commit, actions, template, uploads, requestUpload, focusAlt, libraryError]);

  // ---------------------------------------------------------------- drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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

  const onDragOver = ({ active: a, over }) => {
    if (a.data.current?.kind !== 'block' || !dragLayout) return;
    const from = findBlock(dragLayout, a.id);
    const to = resolveOver(dragLayout, over, a.rect.current.translated);
    if (!from || !to || from.areaId === to.areaId) return;
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
  const statusText = { saved: 'Saved', dirty: 'Unsaved changes…', saving: 'Saving…', error: 'Save failed - retrying' }[saveState];
  const previewGuide = layout ? { ...meta, slug: meta.slug, layout, body: layoutToMarkdown(layout), updated_at: new Date().toISOString() } : null;
  const dragBlock = active?.data?.kind === 'block' ? findBlock(shownLayout, active.id) : null;
  const publicHref = `/guides/${meta.slug}`;

  return (
    <BuilderContext.Provider value={ctx}>
      <div className={styles.root} ref={rootRef}>
        <header className={styles.header} ref={headerRef}>
          <div className={styles.headRow}>
            <Link className={styles.back} href="/admin/dashboard/guides">← Guides</Link>
            <label className={styles.titleField}>
              <span className={styles.srOnly}>Guide title</span>
              <input value={meta.title} maxLength={180} placeholder="Guide title" onChange={e => setMetaField('title', e.target.value)} />
            </label>
            <span className={styles.status} data-state={saveState} role="status" aria-live="polite">{statusText}</span>
            <div className={styles.headTools}>
              <button type="button" className={styles.btn} onClick={undo} disabled={!history.past.length} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">Undo</button>
              <button type="button" className={styles.btn} onClick={redo} disabled={!history.future.length} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">Redo</button>
              <button type="button" className={styles.btn} aria-pressed={preview} onClick={() => { setPreview(p => !p); setSelectedId(null); }}>{preview ? 'Back to editing' : 'Preview'}</button>
              <a className={styles.btn} href={publicHref} target="_blank" rel="noopener noreferrer">Open public page</a>
            </div>
            <div className={styles.headTools}>
              <button type="button" className={styles.btn} onClick={() => commitLive({})} disabled={committing}>{meta.is_published ? 'Update live page' : 'Save'}</button>
              {meta.is_published
                ? <button type="button" className={styles.btn} onClick={() => commitLive({ publish: false })} disabled={committing}>Unpublish</button>
                : <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => commitLive({ publish: true })} disabled={committing}>Publish</button>}
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
            <label className={styles.mini}><span>Access</span>
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
            <div className={styles.workspace}>
              <aside className={styles.left} aria-label="Blocks and images">
                <Palette library={fullLibrary} uploads={uploads} tab={paletteTab} setTab={setPaletteTab} />
              </aside>

              <div className={styles.canvasCol} onClick={e => { if (!e.target.closest('[data-block-id]')) setSelectedId(null); }}>
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
                          {blockCount === 0 ? <p className={styles.canvasHint}>Start with a block from the left panel, or drop images straight onto the page.</p> : null}
                        </div>
                      </main>
                      {fileDrag ? <div className={styles.fileOverlay} aria-hidden="true">Drop images to add them</div> : null}
                    </div>
                  )}
                </div>
              </div>

              <aside className={styles.right} aria-label="Block settings">
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

        {picker ? <TemplatePicker first={picker === 'first'} current={layout?.template} onPick={pickTemplate} onClose={picker === 'switch' ? () => setPicker(null) : undefined} /> : null}
        {libraryPicker ? <LibraryModal library={fullLibrary} onPick={applyLibraryImage} onClose={() => setLibraryPicker(null)} /> : null}
      </div>
    </BuilderContext.Provider>
  );
}
