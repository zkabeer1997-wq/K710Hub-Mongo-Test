'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import styles from './access.module.css';

const ROLE_COPY = {
  member: 'Member',
  admin: 'Admin',
  superadmin: 'Superadmin',
};

function Avatar({ user }) {
  if (user.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatar_url} alt="" />;
  }
  return <span>{String(user.nickname || 'K').charAt(0).toUpperCase()}</span>;
}

export default function AccessManager({ actorPlayerId }) {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [resettingCode, setResettingCode] = useState('');
  const [confirmingCode, setConfirmingCode] = useState('');
  const [revealedCodes, setRevealedCodes] = useState({});
  const [copiedCode, setCopiedCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin-user-roles', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'User access could not be loaded.');
      setUsers(result.users || []);
      setDrafts(Object.fromEntries((result.users || []).map((user) => [user.player_id, user.access_role])));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleUsers = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return users;
    return users.filter((user) =>
      [user.nickname, user.player_id, user.alliance_abbr, user.alliance_name].some((value) =>
        String(value || '').toLowerCase().includes(clean)
      )
    );
  }, [query, users]);

  async function saveRole(user) {
    const role = drafts[user.player_id];
    if (role === user.access_role) return;
    setSaving(user.player_id);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin-user-roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: user.player_id, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The role could not be updated.');
      setUsers((current) =>
        current.map((item) =>
          item.player_id === user.player_id ? { ...item, access_role: role } : item
        )
      );
      setMessage(`${user.nickname} is now ${ROLE_COPY[role].toLowerCase()}.`);
    } catch (saveError) {
      setDrafts((current) => ({ ...current, [user.player_id]: user.access_role }));
      setError(saveError.message);
    } finally {
      setSaving('');
    }
  }

  async function resetPersonalCode(user) {
    if (confirmingCode !== user.player_id) {
      setConfirmingCode(user.player_id);
      setMessage('Select “Confirm reset” to replace this user’s personal code.');
      setError('');
      return;
    }

    setConfirmingCode('');
    setResettingCode(user.player_id);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin-personal-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: user.player_id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The personal code could not be reset.');
      setRevealedCodes((current) => ({ ...current, [user.player_id]: result.personalCode }));
      setUsers((current) =>
        current.map((item) =>
          item.player_id === user.player_id ? { ...item, personal_code_configured: true } : item
        )
      );
      setMessage(
        `New personal code created for ${user.nickname}. Copy it now; it will not be shown again.`
      );
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setResettingCode('');
    }
  }

  async function copyPersonalCode(playerId) {
    try {
      await navigator.clipboard.writeText(revealedCodes[playerId]);
      setCopiedCode(playerId);
      window.setTimeout(
        () => setCopiedCode((current) => (current === playerId ? '' : current)),
        1600
      );
    } catch {
      setError('Could not copy automatically. Select the code and copy it manually.');
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    router.push('/');
    router.refresh();
  }

  const counters = [
    { label: 'Members', value: users.filter((user) => user.access_role === 'member').length },
    { label: 'Admins', value: users.filter((user) => user.access_role === 'admin').length },
    {
      label: 'Superadmins',
      value: users.filter((user) => user.access_role === 'superadmin').length,
    },
  ];

  return (
    <AdminShell
      title="User access"
      subtitle="Assign member, admin, and superadmin permissions"
      onLogout={logout}
      counters={counters}
    >
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <span>Permission ledger</span>
            <h2>Verified Kingshot accounts</h2>
            <p>Only accounts that have completed Kingdom 710 verification appear here.</p>
          </div>
          <label className={styles.search}>
            <span>Search users</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, ID, or alliance"
            />
          </label>
        </header>

        {message && (
          <div className={styles.success} role="status">
            {message}
          </div>
        )}
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className={styles.loading} aria-label="Loading users">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className={styles.list}>
            <div className={styles.listHead} aria-hidden="true">
              <span>Account</span>
              <span>Kingdom</span>
              <span>Access</span>
              <span>Actions & personal code</span>
            </div>
            {visibleUsers.map((user) => {
              const isSelf = user.player_id === actorPlayerId;
              const changed = drafts[user.player_id] !== user.access_role;
              return (
                <article className={styles.row} key={user.player_id}>
                  <div className={styles.identity}>
                    <span className={styles.avatar}>
                      <Avatar user={user} />
                    </span>
                    <div>
                      <strong>{user.nickname}</strong>
                      <span>
                        #{user.player_id}
                        {user.alliance_abbr ? ` · [${user.alliance_abbr}]` : ''}
                      </span>
                    </div>
                  </div>
                  <div className={styles.kingdom}>#{user.kingdom_id}</div>
                  <label className={styles.roleSelect}>
                    <span>Access role</span>
                    <select
                      value={drafts[user.player_id] || user.access_role}
                      disabled={isSelf || saving === user.player_id}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.player_id]: event.target.value,
                        }))
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </label>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={isSelf || !changed || saving === user.player_id}
                      onClick={() => saveRole(user)}
                      title={isSelf ? 'You cannot remove your own superadmin role' : undefined}
                    >
                      {isSelf
                        ? 'Your account'
                        : saving === user.player_id
                          ? 'Saving…'
                          : 'Apply role'}
                    </button>
                    {revealedCodes[user.player_id] ? (
                      <div className={styles.codeReveal}>
                        <span>Shown once</span>
                        <code>{revealedCodes[user.player_id]}</code>
                        <button type="button" onClick={() => copyPersonalCode(user.player_id)}>
                          {copiedCode === user.player_id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.codeButton}
                        disabled={resettingCode === user.player_id}
                        onClick={() => resetPersonalCode(user)}
                      >
                        {resettingCode === user.player_id
                          ? 'Resetting…'
                          : confirmingCode === user.player_id
                            ? 'Confirm reset'
                            : user.personal_code_configured
                              ? 'Reset personal code'
                              : 'Create personal code'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {visibleUsers.length === 0 && (
              <p className={styles.empty}>No verified users match this search.</p>
            )}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
