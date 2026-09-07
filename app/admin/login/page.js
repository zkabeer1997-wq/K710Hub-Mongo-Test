'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="command-hall-page">
      <div className="command-hall-card">
        <svg className="command-hall-crest" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <h1>ADMIN SIGN IN</h1>
        <p className="sub">Kingdom 710 administrators</p>
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
      </div>
    </div>
  );
}
