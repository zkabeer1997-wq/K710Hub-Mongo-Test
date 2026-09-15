'use client';

import { useEffect, useState } from 'react';
import { mergeFormFields, mergeFormIntro } from './formFieldMeta.mjs';

// Fetches the admin-editable label/placeholder/help/intro overrides for a
// public form and merges them with the hardcoded defaults, so the page
// renders correctly even before the fetch resolves (or if it fails).
export function useFormFieldMeta(formKey) {
  const [intro, setIntro] = useState(() => mergeFormIntro(formKey, null));
  const [fields, setFields] = useState(() => mergeFormFields(formKey, null));

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/form-field-meta?form_key=${formKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setIntro(mergeFormIntro(formKey, data?.intro));
        if (data?.fields) setFields(mergeFormFields(formKey, data.fields));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [formKey]);

  return { intro, fields };
}
