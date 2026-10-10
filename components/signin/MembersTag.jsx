'use client';

import { useT } from '../i18n/LanguageProvider';

// Small "Members" tag with a lock for links that need sign-in. Rendered only for
// signed-out visitors. The lock is decoration; the words carry the meaning.
export default function MembersTag() {
  const t = useT();
  return (
    <span className="members-tag">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      {t('signin.tag.members')}
      <span className="sr-only">: {t('signin.tag.membersSr')}</span>
    </span>
  );
}
