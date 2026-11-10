'use client';

import { useT } from './LanguageProvider';

// Admin-editable Page text that has a hand-translated catalog twin. While the admin has not changed
// the wording (text === defaultText), show the catalog string so every language gets the reviewed
// translation instead of a runtime machine translation. An edited text is shown as written.
export default function CatalogText({ k, text, defaultText }) {
  const t = useT();
  if (text && text !== defaultText) return text;
  return t(k);
}
