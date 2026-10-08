'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import guideStyles from '../../guides/guideLayout.module.css';
import GuideMarkdown from '../../guides/GuideMarkdown';
import { makeLink, toggleList, wrapSelection } from '../../../lib/guideTextFormat.mjs';
import {
  editorHtmlToMarkdown, htmlToMarkdown, canEditInPlace, markdownToEditorHtml, normalizeLinkAddress, plainTextToEditorHtml,
} from '../../../lib/guideRichText.mjs';
import { useBuilder } from './BuilderContext';
import styles from './builder.module.css';

const exec = (command, value = null) => document.execCommand(command, false, value);
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

// Plain markdown fallback for text that uses tables, quotes or code (only
// reachable for older classic guides converted into blocks).
function MarkdownFallback({ block, field, label }) {
  const { update } = useBuilder();
  const ref = useRef(null);
  const value = block[field];
  const apply = fn => {
    const el = ref.current;
    if (!el) return;
    const out = fn(el.value, el.selectionStart, el.selectionEnd);
    update(block.id, { [field]: out.value }, `md:${block.id}`);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(out.start, out.end); });
  };
  return (
    <div className={styles.rtWrap}>
      <p className={styles.hintLine}>This text uses advanced formatting (a table, quote or code), so it is edited as plain text with markdown symbols. Convert it by deleting those parts.</p>
      <div className={styles.rtToolbar} role="toolbar" aria-label="Text formatting">
        <button type="button" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '**'))}><b>B</b></button>
        <button type="button" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '*'))}><i>I</i></button>
        <button type="button" onClick={() => { const url = window.prompt('Link address (https://...)', 'https://'); if (url && normalizeLinkAddress(url)) apply((v, s, e) => makeLink(v, s, e, normalizeLinkAddress(url))); }}>Link</button>
        <button type="button" onClick={() => apply((v, s, e) => toggleList(v, s, e, false))}>List</button>
      </div>
      <textarea ref={ref} className={styles.rtArea} aria-label={`${label} (advanced)`} value={value} rows={6} maxLength={30000}
        onChange={e => update(block.id, { [field]: e.target.value }, `md:${block.id}`)} />
      {value.trim() ? <div className={`${guideStyles.prose} ${styles.rtPreview}`}><GuideMarkdown>{value}</GuideMarkdown></div> : null}
    </div>
  );
}

export default function RichTextEditor({ block, selected, field = 'md', label = 'Text' }) {
  const value = block[field] || '';
  // Decided once per block mount, so typing never flips the editor mode.
  const [editable] = useState(() => canEditInPlace(value));
  return editable ? <WysiwygText block={block} selected={selected} field={field} label={label} /> : <MarkdownFallback block={block} field={field} label={label} />;
}

// Keeps the formatting toolbar just above the text block, pinned under the
// header while the block is scrolled partly out of view.
function useFloatingToolbar(wrapRef, floatRef, active) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    let frame = 0;
    const place = () => {
      frame = 0;
      const wrap = wrapRef.current;
      const bar = floatRef.current;
      if (!wrap) return;
      const rect = (wrap.closest('[data-block-id]') || wrap).getBoundingClientRect();
      const root = wrap.closest('[data-builder-root]');
      const hdr = root ? parseFloat(getComputedStyle(root).getPropertyValue('--hdr')) || 112 : 112;
      const height = bar?.offsetHeight || 40;
      const wide = rect.width >= 700;
      const natural = rect.top - height - (wide ? -2 : 36);
      const top = Math.max(natural, hdr + 8);
      const hidden = rect.bottom < hdr + 24 || rect.top > window.innerHeight;
      const left = Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - (bar?.offsetWidth || 400) - 8));
      setPos(p => (p && p.top === top && p.left === left && p.hidden === hidden ? p : { top, left, hidden }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    place();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    return () => { if (frame) cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); ro?.disconnect(); };
  }, [active, wrapRef, floatRef]);
  return pos;
}

function WysiwygText({ block, selected, field, label }) {
  const { update, select } = useBuilder();
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const floatRef = useRef(null);
  const lastEmitted = useRef(null);
  const savedRange = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState('');
  const [active, setActive] = useState({ bold: false, italic: false, ul: false, ol: false, block: 'p', link: false });
  const value = block[field] || '';
  const floatPos = useFloatingToolbar(wrapRef, floatRef, selected);

  // Load markdown into the editor on mount and whenever the text changes from
  // outside (undo / redo / duplicate); typing does not trigger a reset.
  useEffect(() => {
    const el = ref.current;
    if (!el || lastEmitted.current === value) return;
    el.innerHTML = markdownToEditorHtml(value);
    lastEmitted.current = value;
  }, [value]);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const md = editorHtmlToMarkdown(el.innerHTML);
    lastEmitted.current = md;
    update(block.id, { [field]: md }, `md:${block.id}:${field}`);
  }, [block.id, field, update]);

  const readActive = useCallback(() => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel?.rangeCount || !el.contains(sel.anchorNode)) return;
    let node = sel.anchorNode;
    let link = false;
    let blockTag = 'p';
    while (node && node !== el) {
      if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'a') link = true;
        if (tag === 'h2' || tag === 'h3') blockTag = tag;
      }
      node = node.parentNode;
    }
    setActive({
      bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'),
      ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList'), block: blockTag, link,
    });
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    document.addEventListener('selectionchange', readActive);
    return () => document.removeEventListener('selectionchange', readActive);
  }, [selected, readActive]);

  const focusEditor = () => { ref.current?.focus(); };
  const runCmd = fn => { focusEditor(); fn(); sync(); readActive(); };

  const openLink = () => {
    const sel = window.getSelection();
    savedRange.current = sel?.rangeCount && ref.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    const anchor = sel?.anchorNode?.parentElement?.closest?.('a');
    setLinkValue(anchor?.getAttribute('href') || '');
    setLinkError('');
    setLinkOpen(true);
  };
  const applyLink = () => {
    const url = normalizeLinkAddress(linkValue);
    if (!url) { setLinkError('Enter a web address such as https://example.com, a page on this site like /guides, or an email address.'); return; }
    focusEditor();
    const sel = window.getSelection();
    if (savedRange.current) { sel.removeAllRanges(); sel.addRange(savedRange.current); }
    if (sel.isCollapsed) exec('insertHTML', `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/[<>&]/g, '')}</a>`);
    else exec('createLink', url);
    setLinkOpen(false);
    sync();
    readActive();
  };
  const removeLink = () => { focusEditor(); exec('unlink'); setLinkOpen(false); sync(); readActive(); };

  const onPaste = e => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    let insert = '';
    if (html) insert = markdownToEditorHtml(htmlToMarkdown(html));
    else if (text) insert = plainTextToEditorHtml(text);
    if (!insert) return;
    // One paragraph pastes inline; several keep their structure.
    const single = insert.match(/^<p>((?:(?!<\/?p>).)*)<\/p>$/);
    exec('insertHTML', single ? single[1] : insert);
    sync();
  };

  const onKeyDown = e => {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openLink(); return; }
    if (mod && (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'i')) {
      // Native behaviour; keep it from reaching global shortcuts.
      e.stopPropagation();
    }
    if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.closest('[data-block-id]')?.focus(); }
  };

  const empty = !value.trim();
  return (
    <div className={styles.rtWrap} ref={wrapRef}>
      <div
        ref={ref}
        className={`${guideStyles.prose} ${styles.wysiwyg}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`${label}. Type here; select text to format it.`}
        data-empty={empty ? 'true' : undefined}
        data-placeholder={`${label}: click and start typing…`}
        spellCheck
        onFocus={() => { select(block.id); exec('defaultParagraphSeparator', 'p'); readActive(); }}
        onInput={sync}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onDrop={e => { if (!e.dataTransfer?.files?.length) e.preventDefault(); }}
        onClickCapture={e => { if (e.target.closest?.('a')) e.preventDefault(); }}
      />
      {selected ? (
        <div className={styles.rtFloat} ref={floatRef} style={floatPos ? { top: floatPos.top, left: floatPos.left, visibility: floatPos.hidden ? 'hidden' : 'visible' } : { visibility: 'hidden' }}>
          <div className={styles.rtToolbar} role="toolbar" aria-label="Text formatting" onMouseDown={e => { if (!e.target.closest('input, select')) e.preventDefault(); }}>
            <button type="button" aria-label="Bold" aria-pressed={active.bold} title={`Bold (${isMac() ? 'Cmd' : 'Ctrl'}+B)`} onClick={() => runCmd(() => exec('bold'))}><b>B</b></button>
            <button type="button" aria-label="Italic" aria-pressed={active.italic} title={`Italic (${isMac() ? 'Cmd' : 'Ctrl'}+I)`} onClick={() => runCmd(() => exec('italic'))}><i>I</i></button>
            <button type="button" aria-label="Link" aria-pressed={active.link} title={`Link (${isMac() ? 'Cmd' : 'Ctrl'}+K)`} onClick={openLink}>Link</button>
            <span className={styles.rtSep} aria-hidden="true" />
            <button type="button" aria-label="Bulleted list" aria-pressed={active.ul} title="Bulleted list" onClick={() => runCmd(() => exec('insertUnorderedList'))}>• List</button>
            <button type="button" aria-label="Numbered list" aria-pressed={active.ol} title="Numbered list" onClick={() => runCmd(() => exec('insertOrderedList'))}>1. List</button>
            <span className={styles.rtSep} aria-hidden="true" />
            <select aria-label="Text style" value={active.block} onChange={e => { const v = e.target.value; focusEditor(); exec('formatBlock', v); sync(); readActive(); }}>
              <option value="p">Normal text</option>
              <option value="h2">Large heading</option>
              <option value="h3">Small heading</option>
            </select>
            <button type="button" aria-label="Clear formatting" title="Clear formatting" onClick={() => runCmd(() => { exec('removeFormat'); exec('unlink'); if (document.queryCommandState('insertUnorderedList')) exec('insertUnorderedList'); if (document.queryCommandState('insertOrderedList')) exec('insertOrderedList'); exec('formatBlock', 'p'); })}>Clear</button>
          </div>
          {linkOpen ? (
            <form className={styles.linkPop} onSubmit={e => { e.preventDefault(); applyLink(); }}>
              <label htmlFor={`lk-${block.id}`}>Link address</label>
              <input id={`lk-${block.id}`} autoFocus value={linkValue} placeholder="https://example.com" onChange={e => { setLinkValue(e.target.value); setLinkError(''); }}
                onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setLinkOpen(false); focusEditor(); } }} aria-invalid={linkError ? 'true' : undefined} />
              <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>Apply</button>
              {active.link ? <button type="button" className={styles.btn} onClick={removeLink}>Remove link</button> : null}
              <button type="button" className={styles.btn} onClick={() => { setLinkOpen(false); focusEditor(); }}>Cancel</button>
              {linkError ? <p className={styles.errorText} role="alert">{linkError}</p> : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
