'use client';

import { useEffect, useRef } from 'react';
import { LANGUAGES } from '../../lib/i18n/languages.mjs';
import Icon from '../ui/icons';

const FOCUSABLE = 'button:not([disabled])';

// Full-screen sheet on phones, centred dialog on desktop (CSS). One tap on a language switches the
// whole page and closes the dialog: no search box, no Apply step. Focus is trapped, Escape closes,
// and the provider restores focus to the button that opened it.
export default function LanguagePicker({ current, t, onChoose, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (panel?.querySelector('[aria-current="true"]') || panel?.querySelector(FOCUSABLE))?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="k710-language-overlay"
      data-k710-no-translate
      role="dialog"
      aria-modal="true"
      aria-labelledby="k710-language-title"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="k710-language-panel" ref={panelRef}>
        <div className="k710-language-head">
          <div>
            <h2 id="k710-language-title">{t('lang.picker.title')}</h2>
            <p>{t('lang.picker.hint')}</p>
          </div>
          <button type="button" className="k710-language-close" onClick={onClose} aria-label={t('lang.picker.close')}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <ul className="k710-language-grid">
          {LANGUAGES.map((lang) => {
            const selected = lang.code === current;
            const name = lang.native === lang.english ? lang.native : `${lang.native} (${lang.english})`;
            return (
              <li key={lang.code}>
                <button
                  type="button"
                  className="k710-language-option"
                  lang={lang.code === 'zh' ? 'zh-Hans' : lang.code}
                  aria-label={name}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onChoose(lang.code)}
                >
                  <span className="k710-language-native" dir={lang.dir}>{lang.native}</span>
                  <span className="k710-language-english" lang="en" dir="ltr">{lang.english}</span>
                  {selected && (
                    <span className="k710-language-check"><Icon name="check" size={18} /></span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
