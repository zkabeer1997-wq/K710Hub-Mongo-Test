'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './member-login.module.css';

function isSafeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//');
}

function isAdminRole(role) {
  return role === 'admin' || role === 'superadmin';
}

function formatNumber(value) {
  return value == null || value === '' ? '—' : new Intl.NumberFormat().format(value);
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

function Avatar({ profile, large = false }) {
  const initial = (profile?.nickname || 'K').trim().charAt(0).toUpperCase();
  return (
    <span className={large ? styles.avatarLarge : styles.avatar}>
      {profile?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarUrl} alt={`${profile.nickname} profile`} />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
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

  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.shell}>
        {banner && <div className={styles.banner}>{banner}</div>}

        <section className={styles.intro} aria-labelledby="member-login-title">
          <div>
            <span className={styles.eyebrow}>Secure player access · Kingdom 710</span>
            <h1 id="member-login-title">Welcome back,<br /><em>Governor.</em></h1>
            <p>
              Login to your Account with a code sent directly to your game.
            </p>
          </div>

          <div className={styles.assurance}>
            <span className={styles.assuranceMark} aria-hidden="true">◆</span>
            <div>
              <strong>{view === 'personalCode' ? 'Secure fallback verification' : 'Official in-game verification'}</strong>
              <span>
                {view === 'personalCode'
                  ? 'Your personal code is stored only as a protected one-way hash.'
                  : 'Your code is checked by Kingshot and is never stored.'}
              </span>
            </div>
          </div>
        </section>

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
                <span>Step {step} / 02</span>
                <span className={styles.stepLine}><i style={{ width: view === 'player' ? '50%' : '100%' }} /></span>
              </div>

              {view === 'player' && (
                <form onSubmit={submitPlayer} className={styles.form}>
                  <header>
                    <h2>Connect your account</h2>
                    <p>Enter the Player ID shown in your Kingshot profile.</p>
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
                      minLength={4}
                      maxLength={20}
                      required
                      autoFocus
                    />
                  </div>
                  <button className={styles.primary} type="submit" disabled={busy}>
                    <span>{busy ? 'Connecting…' : 'Continue'}</span><b aria-hidden="true">→</b>
                  </button>
                </form>
              )}

              {view === 'game' && (
                <div className={styles.form}>
                  <header>
                    <h2>Ready your game</h2>
                    <p>Open Kingshot on your device so it can receive the verification code.</p>
                  </header>
                  <div className={styles.gameCheck} aria-hidden="true">
                    <span>KS</span><i />
                  </div>
                  <button className={styles.primary} type="button" onClick={requestCode} disabled={busy}>
                    <span>{busy ? 'Requesting code…' : 'Yes, the game is open'}</span><b aria-hidden="true">→</b>
                  </button>
                  <button className={styles.textButton} type="button" onClick={startOver} disabled={busy}>
                    Use a different Player ID
                  </button>
                </div>
              )}

              {view === 'code' && (
                <form onSubmit={submitCode} className={styles.form}>
                  <header>
                    <h2>Check your game</h2>
                    <p>Enter the one-time verification code sent to Kingshot.</p>
                  </header>
                  <label htmlFor="kingshot-code">Verification code</label>
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
                    Use a different Player ID
                  </button>
                </form>
              )}

              {view === 'personalCode' && (
                <form onSubmit={submitPersonalCode} className={styles.form}>
                  <header>
                    <h2>Use your personal code</h2>
                    <p>
                      The game could not receive a verification code. Enter the private
                      6-digit code a superadmin assigned to your account.
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
                    Use a different Player ID
                  </button>
                </form>
              )}

              {status && <div className={styles.error} role="alert">{status}</div>}
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

          {view === 'profile' && profile && (
            <div className={styles.profile}>
              <div className={styles.connectedRow}>
                <span><i /> Account connected</span>
                <span className={styles.role}>{profile.role}</span>
              </div>
              <div className={styles.profileHead}>
                <Avatar profile={profile} large />
                <div>
                  <h2>{profile.nickname}</h2>
                  <p>#{profile.playerId} · Kingdom {profile.kingdomId}</p>
                  <span>{profile.allianceAbbr ? `[${profile.allianceAbbr}] ${profile.allianceName}` : 'No alliance listed'}</span>
                </div>
              </div>

              {adminAccessRequested && !isAdminRole(profile.role) && (
                <div className={styles.accessNotice} role="status">
                  Your member account does not have administrator access.
                </div>
              )}

              <div className={styles.stats} aria-label="Player statistics">
                <div><span>Power</span><strong>{formatNumber(profile.power)}</strong></div>
                <div><span>Mystic Trial</span><strong>{formatNumber(profile.mysticTrial)}</strong></div>
                <div><span>Kills</span><strong>{formatNumber(profile.kills)}</strong></div>
              </div>

              <nav className={styles.destinations} aria-label="Member destinations">
                <Link href="/forms"><span>Member forms</span><b>→</b></Link>
                <Link href="/tools"><span>Tools & calculators</span><b>→</b></Link>
                <Link href="/guides"><span>Kingdom guides</span><b>→</b></Link>
                {isAdminRole(profile.role) && (
                  <Link href="/admin/dashboard/overview"><span>Admin dashboard</span><b>→</b></Link>
                )}
              </nav>

              <button className={styles.textButton} type="button" onClick={logout} disabled={busy}>
                {busy ? 'Logging out…' : 'Log out'}
              </button>
            </div>
          )}
        </section>
      </div>

      <p className={styles.disclaimer}>
        Not affiliated with Century Games. Authentication is completed through the official Kingshot store.
      </p>
    </main>
  );
}
