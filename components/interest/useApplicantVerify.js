'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// State machine for the optional "Verify with your Kingshot account" panel on
// /interest. It talks ONLY to /api/applicant/*. It never calls the member login
// routes and never reads the member session.
//
// view: 'loading' | 'player' | 'code' | 'verified' | 'skipped'

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.');
    Object.assign(error, data);
    throw error;
  }
  return data;
}

export function useApplicantVerify() {
  const [view, setView] = useState('loading');
  const [profile, setProfile] = useState(null);
  const [playerId, setPlayerId] = useState('');
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const profileRef = useRef(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    let active = true;
    api('/api/applicant/session')
      .then((session) => {
        if (!active) return;
        if (session.state === 'verified' && session.profile) {
          setProfile(session.profile);
          setView('verified');
        } else if (session.state === 'awaiting_code') {
          setPlayerId(session.playerId || '');
          setView('code');
        } else {
          setPlayerId(session.playerId || '');
          setView('player');
        }
      })
      .catch(() => { if (active) setView('player'); });
    return () => { active = false; };
  }, []);

  const clearMessages = useCallback(() => { setStatus(''); setNotice(''); }, []);

  /** Player ID -> start -> send the code to the game, in one press. */
  const sendCode = useCallback(async (id) => {
    clearMessages();
    setBusy(true);
    try {
      await api('/api/applicant/start', { method: 'POST', body: { playerId: id } });
      await api('/api/applicant/send-code', { method: 'POST' });
      setPlayerId(id);
      setView('code');
      return true;
    } catch (error) {
      setStatus(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [clearMessages]);

  const resendCode = useCallback(async () => {
    clearMessages();
    setBusy(true);
    try {
      await api('/api/applicant/send-code', { method: 'POST' });
      return true;
    } catch (error) {
      setStatus(error.message);
      if (error.code === 'FLOW_EXPIRED') setView('player');
      return false;
    } finally {
      setBusy(false);
    }
  }, [clearMessages]);

  const submitCode = useCallback(async (code) => {
    clearMessages();
    setBusy(true);
    try {
      const data = await api('/api/applicant/verify', { method: 'POST', body: { code } });
      setProfile(data.profile);
      setView('verified');
      return data.profile;
    } catch (error) {
      setStatus(error.message);
      if (error.retryAllowed === false || error.code === 'FLOW_EXPIRED') setView('player');
      return null;
    } finally {
      setBusy(false);
    }
  }, [clearMessages]);

  /** "Use a different account": clears the applicant cookies only. */
  const reset = useCallback(async () => {
    setBusy(true);
    await api('/api/applicant/logout', { method: 'POST' }).catch(() => {});
    setProfile(null);
    setPlayerId('');
    clearMessages();
    setView('player');
    setBusy(false);
  }, [clearMessages]);

  const skip = useCallback(() => { clearMessages(); setView('skipped'); }, [clearMessages]);
  const unskip = useCallback(() => { clearMessages(); setView('player'); }, [clearMessages]);

  /** The verified state is stale (cookie gone or expired): drop it, show the panel again. */
  const expire = useCallback((message) => {
    setProfile(null);
    setView('player');
    setStatus('');
    setNotice(message || '');
  }, []);

  /** Re-checks the cookie with the server. Returns true when still verified. */
  const confirm = useCallback(async () => {
    if (!profileRef.current) return false;
    try {
      const session = await api('/api/applicant/session');
      return session.state === 'verified' && session.profile?.playerId === profileRef.current.playerId;
    } catch {
      // Cannot tell (offline): let the server decide at submit time.
      return true;
    }
  }, []);

  return { view, profile, playerId, status, notice, busy, sendCode, resendCode, submitCode, reset, skip, unskip, expire, confirm, setStatus };
}
