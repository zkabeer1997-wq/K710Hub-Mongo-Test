'use client';

import Icon from '../ui/icons';
import { useLanguage } from './LanguageProvider';

// Language control. Shows a globe, the code (EN, ES, ...) or, with showLabel / variant="full", the
// language's own name, and opens the picker dialog (focus moves in, Esc closes, focus returns here).
// `onOpen` lets the mobile menu close itself first so the two never fight over focus.
export default function LanguageSwitcher({ onOpen, className = '', showLabel = false }) {
  const { languageName, languageCode, openLanguageChooser, t } = useLanguage();
  return (
    <button
      type="button"
      className={`lang-switch ${className}`.trim()}
      data-k710-no-translate
      aria-haspopup="dialog"
      aria-label={t('lang.button.aria', { language: languageName })}
      title={t('lang.button.label')}
      onClick={() => { onOpen?.(); openLanguageChooser(); }}
    >
      <Icon name="globe" size={18} />
      {showLabel ? <span className="lang-switch-name" translate="no">{languageName}</span> : <span className="lang-switch-code" translate="no">{languageCode}</span>}
    </button>
  );
}
