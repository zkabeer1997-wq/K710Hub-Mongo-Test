'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [kingshotAdmin, setKingshotAdmin] = useState(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch('/api/session', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (
          data?.state === 'authenticated' &&
          (data.profile?.role === 'admin' || data.profile?.role === 'superadmin')
        ) {
          setKingshotAdmin(data.profile);
          router.replace('/admin/dashboard/overview');
          router.refresh();
          return;
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push('/admin/dashboard/overview');
        router.refresh();
      } else {
        setError('Incorrect password.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="command-hall-page">
        <div className="command-hall-card">
          <h1>ADMIN SIGN IN</h1>
          <p className="sub">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="command-hall-page">
      <div className="command-hall-card">
        <svg className="command-hall-crest" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <h1>ADMIN SIGN IN</h1>
        <p className="sub">Kingdom 710 administrators</p>

        {kingshotAdmin && (
          <p className="sub" style={{ marginBottom: 16 }}>
            Signed in as {kingshotAdmin.nickname} ({kingshotAdmin.role}). Opening dashboard…
          </p>
        )}

        <form className="command-hall-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-password" className="admin-drawer-field">
            <span>Admin Password</span>
            <div className="command-hall-field">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="command-hall-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </label>
          {error && <div className="status error">{error}</div>}
          <button type="submit" className="command-hall-submit" disabled={loading}>
            {loading ? 'Checking...' : 'Sign in'}
          </button>
        </form>

        <p className="sub" style={{ marginTop: 20 }}>
          Prefer player login?{' '}
          <Link href="/login?next=/admin/dashboard/overview&admin=1">
            Sign in with Kingshot
          </Link>
        </p>
      </div>
    </div>
  );
}
