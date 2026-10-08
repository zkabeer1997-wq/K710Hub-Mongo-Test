'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { VIDEO_ERROR, VIDEO_HELP, parseVideoUrl, videoEmbedSrc, videoLinkUrl } from '../../../lib/guideLayout.mjs';
import styles from './builder.module.css';

export function Row({ label, htmlFor, children, hint }) {
  return (
    <div className={styles.inspRow}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function Segmented({ label, value, options, onChange }) {
  const id = useId();
  return (
    <div className={styles.inspRow}>
      <span id={id}>{label}</span>
      <div className={styles.segmented} role="group" aria-labelledby={id}>
        {options.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>)}
      </div>
    </div>
  );
}

export function AltField({ item, onChange, autoFocus, idPrefix }) {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const missing = item.src && !item.decorative && !item.alt.trim();
  return (
    <>
      <Row label="Describe this image (alt text)" htmlFor={`${idPrefix}-alt`} hint="Screen readers read this aloud for people who cannot see the picture, and it shows if the image fails to load. Example: Map of the Kingdom with the castle in the centre.">
        <textarea ref={ref} id={`${idPrefix}-alt`} rows={2} value={item.alt} maxLength={300} disabled={item.decorative} aria-invalid={missing ? 'true' : undefined} className={missing ? styles.invalid : undefined}
          placeholder={item.decorative ? 'Not needed for a decorative image' : 'What does this picture show?'}
          onChange={e => onChange({ alt: e.target.value })} />
      </Row>
      <label className={styles.check}>
        <input type="checkbox" checked={item.decorative} onChange={e => onChange({ decorative: e.target.checked, alt: e.target.checked ? '' : item.alt })} />
        This image is only decoration (no description needed)
      </label>
    </>
  );
}

// One field for both video sources. Validates as you type, never stores the
// pasted address (only provider + id).
export function VideoLinkField({ block, onChange, idPrefix, preview = false, help = true }) {
  const [text, setText] = useState(() => videoLinkUrl(block));
  const [error, setError] = useState('');
  useEffect(() => {
    // Undo / redo changed the block: show its link again.
    const current = parseVideoUrl(text);
    if (current.provider !== block.provider || (current.id || '') !== (block.videoId || '')) {
      if (!current.error || block.provider) setText(videoLinkUrl(block));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.provider, block.videoId]);
  const onText = value => {
    setText(value);
    const parsed = parseVideoUrl(value);
    if (parsed.error) { setError(parsed.error); return; }
    setError('');
    onChange({ provider: parsed.provider, videoId: parsed.id });
  };
  const embed = block.provider && block.videoId ? videoEmbedSrc(block).replace('?autoplay=1&rel=0', '?rel=0') : '';
  return (
    <div className={styles.videoField}>
      <Row label="Video link" htmlFor={`${idPrefix}-vurl`}>
        <input id={`${idPrefix}-vurl`} value={text} maxLength={300} placeholder="Paste a YouTube or Google Drive link" aria-invalid={error ? 'true' : undefined} aria-describedby={`${idPrefix}-vhelp`}
          onChange={e => onText(e.target.value)} onClick={e => e.stopPropagation()} />
      </Row>
      {error ? <p className={styles.errorText} role="alert">{error || VIDEO_ERROR}</p> : null}
      {block.provider ? <p className={styles.okText} role="status">{block.provider === 'drive' ? 'Google Drive video found.' : 'YouTube video found.'} Readers press play to load it.</p> : null}
      {!help ? <p id={`${idPrefix}-vhelp`} className={styles.hintLine}>Paste a YouTube link or a Google Drive share link. Examples and sharing steps are in the settings panel.</p> : null}
      {help ? (
      <div id={`${idPrefix}-vhelp`} className={styles.videoHelp}>
        <p><strong>YouTube:</strong> {VIDEO_HELP.youtube.replace('Paste a YouTube link, for example ', 'for example ')}</p>
        <p><strong>Google Drive:</strong> {VIDEO_HELP.drive}</p>
        <p>The Drive video must be shared with &quot;Anyone with the link&quot;, otherwise readers will see a permission message.</p>
      </div>
      ) : null}
      {preview && embed ? (
        <div className={styles.videoPreview}>
          <iframe src={embed} title="Video preview" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />
        </div>
      ) : null}
    </div>
  );
}
