'use client';

import { useT } from '../i18n/LanguageProvider';
import { formatCount, mysticNoteKey } from '../../lib/powerProfiles.mjs';

/**
 * The Mystic Trial total, read-only: it comes from the member's Kingshot sign-in and cannot be typed.
 * `mystic` is { value, source: 'login' | 'saved' | 'none' } from resolveMysticScore (same wording as the Power Profile review).
 */
export default function MysticTrialReadout({ mystic }) {
  const t = useT();
  const value = mystic?.value || '';
  return (
    <div className="member-identity-field mystic-readout" data-testid="dragon-mystic">
      <span className="member-identity-label" id="fd-mystic-label">Mystic Trial Total Score</span>
      <p className="mystic-readout-value" aria-labelledby="fd-mystic-label" aria-describedby="fd-mystic-note">{value ? formatCount(value) : t('profile.mystic.none')}</p>
      <p className="member-identity-hint" id="fd-mystic-note">{t(mysticNoteKey(mystic?.source))}</p>
    </div>
  );
}
