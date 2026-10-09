'use client';

import { Callout } from './ui';
import { useT } from './i18n/LanguageProvider';

export default function FormClosedNotice({ message }) {
  const t = useT();
  return (
    <Callout tone="warning" title={t('form.closed.title')}>
      <p>{message || t('form.closed.default')}</p>
    </Callout>
  );
}
