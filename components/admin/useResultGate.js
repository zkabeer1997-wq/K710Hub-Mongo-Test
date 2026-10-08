'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEventState, runEventAction } from './eventControlClient';
import { resultOwner } from '../../lib/resultVisibility.mjs';

const EVENT_TYPE = { kvk: 'kvk', noble: 'flamedragon' };

// Is the form that owns My appointment / My Noble Advisor appointment open? `open` is null until
// loaded (no warning is shown while unknown). openNow() opens just that form (a stale window is cleared).
export default function useResultGate(kind) {
  const [open, setOpen] = useState(null);
  const formKey = resultOwner(kind)?.formKey;
  const type = EVENT_TYPE[kind];
  const reload = useCallback(async () => {
    try {
      const state = await fetchEventState(type);
      const form = (state.forms || []).find((f) => f.form_key === formKey);
      setOpen(form ? form.is_open === true : null);
    } catch {
      setOpen(null);
    }
  }, [type, formKey]);
  useEffect(() => { reload(); }, [reload]);
  const openNow = useCallback(async () => {
    await runEventAction(type, 'open_forms', { form_key: formKey });
    await reload();
  }, [type, formKey, reload]);
  return { open, reload, openNow };
}
