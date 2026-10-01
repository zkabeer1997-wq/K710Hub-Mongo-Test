'use client';

import { useCallback, useEffect, useState } from 'react';

// Loads GET /api/kvk-appointments once and exposes a reload (used after a save).
export function useAppointments() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/kvk-appointments', { cache: 'no-store', credentials: 'same-origin' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load appointments.');
      setData(body);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load appointments.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}
