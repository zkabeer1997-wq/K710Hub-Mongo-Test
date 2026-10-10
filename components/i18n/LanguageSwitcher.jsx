'use client';

import Icon from '../ui/icons';
import { useLanguage } from './LanguageProvider';

// Language control. Shows a globe, the code (EN, ES, ...) or, with showLabel, the language's own
// name, and opens the picker dialog (focus moves in, Esc closes, focus returns here).
// variant="header": globe + the word "Language" + the current language in its own script + a caret
// (phones: globe + code + caret). variant="menu": a full-width "Language: <own name>" row.
// `onOpen` lets the mobile menu close itself first so the two never fight over focus.
export default function LanguageSwitcher({ onOpen, className = '', showLabel = false, variant }) {
  const { languageName, languageCode, openLanguageChooser, t } = useLanguage();
  let content;
  if (variant === 'header') {
    content = (
      <>
        <Icon name="globe" size={18} />
        <span className="lang-switch-word">{t('lang.button.label')}<span aria-hidden="true"> ·</span></span>
        <span className="lang-switch-name lang-switch-native" translate="no">{languageName}</span>
        <span className="lang-switch-code" translate="no">{languageCode}</span>
        <span className="lang-switch-caret" aria-hidden="true">▾</span>
      </>
    );
  } else if (variant === 'menu') {
    content = (
      <>
        <Icon name="globe" size={20} />
        <span className="lang-switch-row">{t('lang.menu.row')} <span className="lang-switch-name" translate="no">{languageName}</span></span>
        <span className="lang-switch-caret" aria-hidden="true">▾</span>
      </>
    );
  } else {
    content = (
      <>
        <Icon name="globe" size={18} />
        {showLabel ? <span className="lang-switch-name" translate="no">{languageName}</span> : <span className="lang-switch-code" translate="no">{languageCode}</span>}
      </>
    );
  }
  return (
    <button
      type="button"
      className={`lang-switch ${variant ? `lang-switch--${variant}-style ` : ''}${className}`.trim()}
      data-k710-no-translate
      aria-haspopup="dialog"
      aria-label={t('lang.button.aria', { language: languageName })}
      title={t('lang.button.label')}
      onClick={() => { onOpen?.(); openLanguageChooser(); }}
    >
      {content}
    </button>
  );
}
