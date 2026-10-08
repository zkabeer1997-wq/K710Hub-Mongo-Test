'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './member-login.module.css';
import { PageHero } from '../../components/ui';
import MemberDashboard from '../../components/member/MemberDashboard';

function isSafeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//');
}

function isAdminRole(role) {
  return role === 'admin' || role === 'superadmin';
}

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

export default function PlayerRecordGate({ banner, next, adminAccessRequested = false }) {
  const router = useRouter();
  const safeNext = useMemo(() => (isSafeNext(next) ? next : ''), [next]);
  const [view, setView] = useState('loading');
  const [playerId, setPlayerId] = useState('');
  const [code, setCode] = useState('');
  const [profile, setProfile] = useState(null);
  const [deniedKingdom, setDeniedKingdom] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api('/api/session')
      .then((session) => {
        if (!active) return;
        if (session.state === 'authenticated') {
          if (safeNext && (!safeNext.startsWith('/admin') || isAdminRole(session.profile?.role))) {
            router.replace(safeNext);
            return;
          }
          setProfile(session.profile);
          setView('profile');
          return;
        }
        if (session.state === 'awaiting_code') setView('code');
        else if (session.state === 'awaiting_personal_code') setView('personalCode');
        else if (session.state === 'awaiting_game_confirmation') setView('game');
        else setView('player');
      })
      .catch(() => {
        if (active) setView('player');
      });
    return () => { active = false; };
  }, [router, safeNext]);

  function clearStatus() {
    setStatus('');
  }

  async function submitPlayer(event) {
    event.preventDefault();
    clearStatus();
    if (!/^\d{4,20}$/.test(String(playerId).trim())) {
      setStatus('That Player ID does not look right. Use only numbers, at least 4 digits. Check the number in your Kingshot profile.');
      document.getElementById('kingshot-player-id')?.focus();
      return;
    }
    setBusy(true);
    try {
      await api('/api/login/start', { method: 'POST', body: { playerId } });
      setView('game');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestCode() {
    clearStatus();
    setBusy(true);
    try {
      await api('/api/login/send-code', { method: 'POST' });
      setView('code');
    } catch (error) {
      setStatus(error.message);
      if (error.personalCodeAllowed) setView('personalCode');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event) {
    event.preventDefault();
    clearStatus();
    setBusy(true);
    try {
      const data = await api('/api/login/verify', { method: 'POST', body: { code } });
      setCode('');
      setProfile(data.profile);
      window.dispatchEvent(new Event('k710-auth-changed'));
      if (safeNext && (!safeNext.startsWith('/admin') || isAdminRole(data.profile?.role))) {
        router.push(safeNext);
        router.refresh();
      } else {
        setView('profile');
      }
    } catch (error) {
      setCode('');
      if (error.code === 'KINGDOM_ACCESS_DENIED') {
        setDeniedKingdom(error.kingdomId ?? null);
        setView('denied');
      } else {
        setStatus(error.message);
        if (error.retryAllowed === false) setView('player');
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitPersonalCode(event) {
    event.preventDefault();
    clearStatus();
    setBusy(true);
    try {
      const data = await api('/api/login/verify-personal-code', {
        method: 'POST',
        body: { code },
      });
      setCode('');
      setProfile(data.profile);
      window.dispatchEvent(new Event('k710-auth-changed'));
      if (safeNext && (!safeNext.startsWith('/admin') || isAdminRole(data.profile?.role))) {
        router.push(safeNext);
        router.refresh();
      } else {
        setView('profile');
      }
    } catch (error) {
      setCode('');
      setStatus(error.message);
      if (error.retryAllowed === false) setView('player');
    } finally {
      setBusy(false);
    }
  }

  async function startOver() {
    setBusy(true);
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    setPlayerId('');
    setCode('');
    setProfile(null);
    setDeniedKingdom(null);
    setStatus('');
    setView('player');
    setBusy(false);
    window.dispatchEvent(new Event('k710-auth-changed'));
  }

  async function logout() {
    setBusy(true);
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    setProfile(null);
    setPlayerId('');
    setView('player');
    setBusy(false);
    window.dispatchEvent(new Event('k710-auth-changed'));
    router.refresh();
  }

  const step = view === 'player' ? '01' : '02';

  if (view === 'profile' && profile) {
    return (
      <main className={styles.page}>
        <div className={styles.grid} aria-hidden="true" />
        <div className={styles.glow} aria-hidden="true" />
        {banner && <div className={styles.banner}>{banner}</div>}
        <MemberDashboard profile={profile} adminAccessRequested={adminAccessRequested} busy={busy} onLogout={logout} />
        <p className={styles.disclaimer}>
          Not affiliated with Century Games. Authentication is completed through the official Kingshot store.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.shell}>
        <div className={styles.rightColumn}>
          <section className={styles.intro} aria-labelledby="member-login-title">
            <PageHero
              tone="console"
              className={styles.hero}
              eyebrow="Secure player access · Kingdom 710"
              title="Sign in"
              lede="Type your Player ID. We will send a short code to your Kingshot game. Type that code here and you are in. You stay signed in for 30 days."
            />

            <div className={styles.assurance}>
              <span className={styles.assuranceMark} aria-hidden="true">◆</span>
              <div>
                <strong>
                  {view === 'personalCode' ? 'Personal code sign-in' : 'Checked by the game itself'}
                </strong>
                <span>
                  {view === 'personalCode'
                    ? 'Your personal code is kept private and safe.'
                    : 'The code goes to your Kingshot game. We never keep it.'}
                </span>
              </div>
            </div>
          </section>
        </div>

        <div className={styles.leftColumn}>
          {banner && <div className={styles.banner}>{banner}</div>}
          {!banner && safeNext && view !== 'profile' && view !== 'loading' && (
            <div className={styles.banner} role="status">
              <strong>Please sign in first.</strong> The page you asked for is for signed-in members. After you sign in we will take you there.{' '}
              <Link href="/help#signin">Need help signing in?</Link>
            </div>
          )}

          <section className={styles.card} aria-live="polite" aria-busy={busy}>
          {view === 'loading' && (
            <div className={styles.loading}>
              <span />
              <span />
              <span />
            </div>
          )}

          {(view === 'player' || view === 'game' || view === 'code' || view === 'personalCode') && (
            <>
              <div className={styles.stepRow}>
                <span>Step {Number(step)} of 2</span>
                <span className={styles.stepLine}><i style={{ width: view === 'player' ? '50%' : '100%' }} /></span>
              </div>

              {view === 'player' && (
                <form onSubmit={submitPlayer} className={styles.form} noValidate>
                  <header>
                    <h2>Your Player ID</h2>
                    <p>You can find it in Kingshot: tap your picture in the top-left corner, then look for “Player ID” (a number).</p>
                  </header>
                  <label htmlFor="kingshot-player-id">Player ID</label>
                  <div className={styles.inputWrap}>
                    <span aria-hidden="true">#</span>
                    <input
                      id="kingshot-player-id"
                      value={playerId}
                      onChange={(event) => setPlayerId(event.target.value.replace(/\D/g, ''))}
                      inputMode="numeric"
                      autoComplete="username"
                      placeholder="123456789"
                      maxLength={20}
                      aria-describedby={status ? 'kingshot-login-status' : undefined}
                      aria-invalid={status && view === 'player' ? 'true' : undefined}
                      autoFocus
                    />
                  </div>
                  {status?.trim() ? <div id="kingshot-login-status" className={styles.error} role="alert">{status}</div> : null}
                  <button className={styles.primary} type="submit" disabled={busy}>
                    <span>{busy ? 'Connecting…' : 'Continue'}</span><b aria-hidden="true">→</b>
                  </button>
                </form>
              )}

              {view === 'game' && (
                <div className={styles.form}>
                  <header>
                    <h2>Open your game</h2>
                    <p>Open Kingshot on your phone first. Then press the button below and we will send the code to the game.</p>
                  </header>
                  <div className={styles.gameCheck} aria-hidden="true">
                    <span>KS</span><i />
                  </div>
                  <button className={styles.primary} type="button" onClick={requestCode} disabled={busy}>
                    <span>{busy ? 'Requesting code…' : 'The game is open — send my code'}</span><b aria-hidden="true">→</b>
                  </button>
                  <button className={styles.textButton} type="button" onClick={startOver} disabled={busy}>
                    Start again with a different Player ID
                  </button>
                </div>
              )}

              {view === 'code' && (
                <form onSubmit={submitCode} className={styles.form}>
                  <header>
                    <h2>Type your code</h2>
                    <p>Look in Kingshot for a message with a short code. Type it here. The code stops working after a few minutes.</p>
                  </header>
                  <label htmlFor="kingshot-code">Code from the game</label>
                  <input
                    id="kingshot-code"
                    className={styles.codeInput}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                    autoComplete="one-time-code"
                    placeholder="Enter code"
                    minLength={4}
                    maxLength={12}
                    required
                    autoFocus
                  />
                  <button className={styles.primary} type="submit" disabled={busy}>
                    <span>{busy ? 'Verifying…' : 'Log in'}</span><b aria-hidden="true">→</b>
                  </button>
                  <button className={styles.textButton} type="button" onClick={startOver} disabled={busy}>
                    Start again with a different Player ID
                  </button>
                </form>
              )}

              {view === 'personalCode' && (
                <form onSubmit={submitPersonalCode} className={styles.form}>
                  <header>
                    <h2>Use your personal code</h2>
                    <p>
                      The game did not receive a code. Ask your alliance leader for your personal code (6 numbers) and type it here.
                    </p>
                  </header>
                  <label htmlFor="kingshot-personal-code">Personal code</label>
                  <input
                    id="kingshot-personal-code"
                    className={styles.codeInput}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="current-password"
                    placeholder="000000"
                    minLength={6}
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    autoFocus
                  />
                  <button className={styles.primary} type="submit" disabled={busy}>
                    <span>{busy ? 'Verifying…' : 'Log in with personal code'}</span><b aria-hidden="true">→</b>
                  </button>
                  <button className={styles.textButton} type="button" onClick={startOver} disabled={busy}>
                    Start again with a different Player ID
                  </button>
                </form>
              )}

              {status?.trim() && view !== 'player' ? <div id="kingshot-login-status" className={styles.error} role="alert">{status}</div> : null}
            </>
          )}

          {view === 'denied' && (
            <div className={styles.denied}>
              <span className={styles.deniedIcon} aria-hidden="true">710</span>
              <span className={styles.eyebrow}>Access restricted</span>
              <h2>This login is for Kingdom 710</h2>
              <p>
                {deniedKingdom
                  ? `Your verified account currently belongs to Kingdom ${deniedKingdom}. You do not have access to the K710 member login.`
                  : 'We could not confirm that your verified account belongs to Kingdom 710.'}
              </p>
              <button className={styles.secondary} type="button" onClick={startOver} disabled={busy}>
                Try another account
              </button>
            </div>
          )}

          </section>
        </div>
      </div>

      <p className={styles.disclaimer}>
        Not affiliated with Century Games. Authentication is completed through the official Kingshot store.
      </p>
    </main>
  );
}
