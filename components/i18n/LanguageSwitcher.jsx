'use client';

import Icon from '../ui/icons';
import { useLanguage } from './LanguageProvider';

// Header language control. It shows the current language code (EN, ES, ...) and
// opens the provider's chooser dialog (role="dialog", focus moves into it,
// Escape closes it and focus returns here). A real <button>, 44px tall.
// `onOpen` lets the mobile menu close itself first so the two never fight over focus.
export default function LanguageSwitcher({ onOpen, className = '', showLabel = false }) {
  const { language, languageCode, openLanguageChooser, translationStatus } = useLanguage();
  const name = languageCode === 'EN' ? 'English' : language;
  const busy = translationStatus === 'translating';
  return (
    <button
      type="button"
      className={`lang-switch ${className}`.trim()}
      data-k710-no-translate
      aria-haspopup="dialog"
      aria-label={`Language: ${name}. Change language`}
      title="Change language"
      onClick={() => { onOpen?.(); openLanguageChooser(); }}
    >
      <Icon name="globe" size={16} />
      <span className="lang-switch-code" translate="no">{languageCode}</span>
      {showLabel && <span className="lang-switch-name" translate="no">{name}</span>}
      {busy && <span className="lang-switch-busy" role="status"><span className="sr-only">Translating</span></span>}
    </button>
  );
}
