'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { FAQ_ANSWER_MAX, FAQ_MAX_ITEMS, FAQ_QUESTION_MAX, changedKeys, faqAdd, faqMove, faqRemove, splitParagraphs, valuesEqual } from '../../lib/pageText.mjs';
import styles from './PageTextEditor.module.css';

async function api(method, body, query = '') {
  const response = await fetch(`/api/admin-page-text${query}`, {
    method, cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) { const e = new Error(json.error || 'That could not be saved. Please try again.'); e.fields = json.fields || {}; throw e; }
  return json;
}

function Counter({ id, length, max }) {
  const near = length > max * 0.9;
  return <span id={id} className={`${styles.counter} ${near ? styles.counterNear : ''}`}>{length} / {max}</span>;
}

function Preview({ text }) {
  const parts = splitParagraphs(text);
  return (
    <div className={styles.preview}>
      <span className={styles.previewLabel}>Preview</span>
      {parts.length ? parts.map((p, i) => <p key={i}>{p}</p>) : <p className={styles.muted}>Empty: the default text will be shown.</p>}
    </div>
  );
}

function TextField({ field, value, base, def, error, onChange, onReset }) {
  const id = `pt-${field.key}`;
  const Tag = field.multiline ? 'textarea' : 'input';
  const isDefault = valuesEqual(value.trim(), def) || value.trim() === '';
  const edited = !valuesEqual(value, base);
  return (
    <div className={`${styles.field} ${edited ? styles.fieldEdited : ''}`}>
      <div className={styles.fieldHead}>
        <label htmlFor={id}>{field.label}{edited ? <span className={styles.dot} title="Changed, not saved yet"> (changed)</span> : null}</label>
        <button type="button" className={styles.linkBtn} disabled={isDefault} onClick={onReset}>Reset to default</button>
      </div>
      <p className={styles.help} id={`${id}-help`}>{field.help}</p>
      <Tag
        id={id} value={value} maxLength={field.maxLength} {...(field.multiline ? { rows: 3 } : { type: 'text' })}
        onChange={(e) => onChange(e.target.value)} autoComplete="off"
        aria-invalid={error ? 'true' : undefined} aria-describedby={`${id}-help ${id}-count${error ? ` ${id}-err` : ''}`}
      />
      <div className={styles.meta}><Counter id={`${id}-count`} length={value.length} max={field.maxLength} /></div>
      {error ? <p className={styles.error} id={`${id}-err`} role="alert">{error}</p> : null}
      <Preview text={value.trim() ? value : def} />
    </div>
  );
}

function FaqEditor({ field, value, base, def, error, onChange, onAskRemove }) {
  const edited = !valuesEqual(value, base);
  const isDefault = valuesEqual(value, def);
  return (
    <div className={`${styles.field} ${edited ? styles.fieldEdited : ''}`}>
      <div className={styles.fieldHead}>
        <span className={styles.fieldTitle}>{field.label}{edited ? <span className={styles.dot}> (changed)</span> : null}</span>
        <button type="button" className={styles.linkBtn} disabled={isDefault} onClick={() => onChange(def.map((x) => ({ ...x })))}>Reset to default</button>
      </div>
      <p className={styles.help}>{field.help} Questions up to {FAQ_QUESTION_MAX} characters, answers up to {FAQ_ANSWER_MAX}. Removing every question brings back the default list.</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <ol className={styles.faqList}>
        {value.map((item, i) => (
          <li key={i} className={styles.faqItem}>
            <fieldset>
              <legend>Question {i + 1}</legend>
              <label htmlFor={`pt-faq-q-${i}`}>Question</label>
              <input id={`pt-faq-q-${i}`} type="text" value={item.q} maxLength={FAQ_QUESTION_MAX} autoComplete="off"
                aria-describedby={`pt-faq-q-${i}-count`}
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
              <div className={styles.meta}><Counter id={`pt-faq-q-${i}-count`} length={item.q.length} max={FAQ_QUESTION_MAX} /></div>
              <label htmlFor={`pt-faq-a-${i}`}>Answer</label>
              <textarea id={`pt-faq-a-${i}`} rows={4} value={item.a} maxLength={FAQ_ANSWER_MAX}
                aria-describedby={`pt-faq-a-${i}-count`}
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
              <div className={styles.meta}><Counter id={`pt-faq-a-${i}-count`} length={item.a.length} max={FAQ_ANSWER_MAX} /></div>
              <div className={styles.faqActions}>
                <button type="button" className={styles.secondary} disabled={i === 0} onClick={() => onChange(faqMove(value, i, -1))} aria-label={`Move question ${i + 1} up`}>Move up</button>
                <button type="button" className={styles.secondary} disabled={i === value.length - 1} onClick={() => onChange(faqMove(value, i, 1))} aria-label={`Move question ${i + 1} down`}>Move down</button>
                <button type="button" className={`${styles.secondary} ${styles.danger}`} onClick={() => onAskRemove(i)} aria-label={`Remove question ${i + 1}`}>Remove</button>
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <button type="button" className={styles.secondary} disabled={value.length >= FAQ_MAX_ITEMS} onClick={() => onChange(faqAdd(value))}>
        Add question{value.length >= FAQ_MAX_ITEMS ? ` (limit of ${FAQ_MAX_ITEMS} reached)` : ''}
      </button>
    </div>
  );
}

export default function PageTextEditor() {
  const [pageId, setPageId] = useState('about');
  const [data, setData] = useState(null);
  const [base, setBase] = useState(null);
  const [current, setCurrent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [removeIndex, setRemoveIndex] = useState(null);
  const [pendingPage, setPendingPage] = useState(null);
  const savedTimer = useRef(null);

  const load = useCallback(async (id) => {
    setLoadError(''); setData(null);
    try {
      const json = await api('GET', null, `?page=${encodeURIComponent(id)}`);
      setData(json); setBase(json.values); setCurrent(json.values); setFieldErrors({}); setSaveError(''); setSaved(false);
    } catch (e) { setLoadError(e.message); }
  }, []);
  useEffect(() => { load(pageId); }, [load, pageId]);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const dirtyKeys = useMemo(() => (base && current ? changedKeys(base, current) : []), [base, current]);
  const dirty = dirtyKeys.length > 0;

  // Warn before closing the tab or following a link with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e) => {
      const a = e.target.closest?.('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      if (!window.confirm('You have unsaved changes. Leave this page and lose them?')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', onClick, true); };
  }, [dirty]);

  const setValue = (key, value) => { setCurrent((c) => ({ ...c, [key]: value })); setSaved(false); setFieldErrors((e) => (e[key] ? { ...e, [key]: '' } : e)); };

  async function save() {
    setSaveError('');
    const faqBad = Array.isArray(current.faq) && current.faq.findIndex((it) => !it.q.trim() || !it.a.trim());
    if (dirtyKeys.includes('faq') && faqBad >= 0) {
      setFieldErrors({ faq: `Question ${faqBad + 1} needs both a question and an answer. Fill it in or remove it.` });
      setSaveError('Some text could not be saved. Check the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const values = Object.fromEntries(dirtyKeys.map((k) => [k, current[k]]));
      const json = await api('PUT', { page: pageId, values });
      setData(json); setBase(json.values); setCurrent(json.values); setFieldErrors({}); setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 6000);
    } catch (e) {
      setFieldErrors(e.fields || {});
      setSaveError(e.message);
    } finally { setSaving(false); }
  }

  function discard() { setCurrent(base); setFieldErrors({}); setSaveError(''); setSaved(false); }

  function switchPage(id) {
    if (id === pageId) return;
    if (dirty) setPendingPage(id); else setPageId(id);
  }

  if (loadError) {
    return <p className={styles.error} role="alert">{loadError} <button type="button" className={styles.linkBtn} onClick={() => load(pageId)}>Try again</button></p>;
  }
  if (!data || !current) return <p>Loading page text...</p>;

  const when = data.updated_at ? new Date(data.updated_at).toLocaleString() : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div className={styles.pagePick}>
          <label htmlFor="pt-page">Page</label>
          <select id="pt-page" value={pageId} onChange={(e) => switchPage(e.target.value)}>
            {data.pages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <a className={styles.secondary} href={data.page.path} target="_blank" rel="noopener noreferrer">Open {data.page.label} (new tab)</a>
      </div>
      <p className={styles.intro}>
        Change the words on this page. Plain text only: leave a blank line to start a new paragraph. If you clear a box, or press Reset to default, the original wording comes back.
        Changes appear on the page within about half a minute of saving.
      </p>
      <p className={styles.lastEdit}>{when ? `Last edited ${when} by ${data.updated_by || 'an admin'}.` : 'Nothing has been edited yet: the page shows its original wording.'}</p>

      <nav className={styles.jump} aria-label="Sections">
        {data.sections.map((s) => <a key={s.id} href={`#pt-sec-${s.id}`}>{s.label}</a>)}
      </nav>

      {data.sections.map((section) => (
        <section key={section.id} id={`pt-sec-${section.id}`} className={styles.section} aria-labelledby={`pt-sec-${section.id}-h`}>
          <h2 id={`pt-sec-${section.id}-h`}>{section.label}</h2>
          <p className={styles.sectionHelp}>{section.help}</p>
          {data.fields.filter((fl) => fl.section === section.id).map((field) => (
            field.kind === 'list' ? (
              <FaqEditor key={field.key} field={field} value={current[field.key]} base={base[field.key]} def={data.defaults[field.key]}
                error={fieldErrors[field.key]} onChange={(v) => setValue(field.key, v)} onAskRemove={setRemoveIndex} />
            ) : (
              <TextField key={field.key} field={field} value={current[field.key]} base={base[field.key]} def={data.defaults[field.key]}
                error={fieldErrors[field.key]} onChange={(v) => setValue(field.key, v)} onReset={() => setValue(field.key, data.defaults[field.key])} />
            )
          ))}
        </section>
      ))}

      <div className={styles.bar} role="region" aria-label="Save changes">
        <p className={styles.status} role="status" aria-live="polite">
          {saveError ? <span className={styles.errorText}>{saveError}</span>
            : saved && !dirty ? <span className={styles.okText}>Saved. Visitors will see this shortly.</span>
            : dirty ? <span className={styles.warnText}>{dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'}</span>
            : <span className={styles.muted}>No changes</span>}
        </p>
        <button type="button" className={styles.secondary} disabled={!dirty || saving} onClick={discard}>Discard changes</button>
        <button type="button" className={styles.primary} disabled={!dirty || saving} onClick={save}>{saving ? 'Saving...' : 'Save changes'}</button>
      </div>

      <ConfirmDialog
        open={removeIndex !== null} title="Remove this question?"
        message={removeIndex !== null && current.faq[removeIndex] ? `"${current.faq[removeIndex].q || `Question ${removeIndex + 1}`}" will be removed from the list. It only disappears from the page after you press Save changes.` : ''}
        confirmLabel="Remove question"
        onConfirm={() => { setValue('faq', faqRemove(current.faq, removeIndex)); setRemoveIndex(null); }}
        onCancel={() => setRemoveIndex(null)}
      />
      <ConfirmDialog
        open={pendingPage !== null} title="Discard unsaved changes?"
        message="You have changes that are not saved. Switching page will lose them."
        confirmLabel="Discard and switch"
        onConfirm={() => { const id = pendingPage; setPendingPage(null); setPageId(id); }}
        onCancel={() => setPendingPage(null)}
      />
    </div>
  );
}
