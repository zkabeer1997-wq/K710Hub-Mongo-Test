'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import AdminDialog from '../../../../components/admin/AdminDialog';
import { Button } from '../../../../components/ui';
import { validateAlias } from '../../../../lib/routeAliases.mjs';
import './page-addresses.css';

export default function PageAddressesPage() {
  const [pages, setPages] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});
  const [state, setState] = useState('loading'); // loading | ready | denied | failed
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null); // { page, to }
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const apply = useCallback((data) => {
    setPages(data.pages || []);
    setDrafts({});
    setErrors({});
  }, []);

  useEffect(() => {
    let live = true;
    fetch('/api/admin-route-aliases', { cache: 'no-store' })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 403 || r.status === 401) return setState('denied');
        if (!r.ok) return setState('failed');
        apply(await r.json());
        setState('ready');
      })
      .catch(() => live && setState('failed'));
    return () => { live = false; };
  }, [apply]);

  function rows() {
    return pages.map((p) => ({ from: p.path, to: p.isDefault ? null : p.current })).filter((r) => r.to);
  }

  function onSave(page) {
    const draft = (drafts[page.path] ?? '').trim();
    const check = validateAlias(page.path, draft, rows());
    if (!check.ok) return setErrors((e) => ({ ...e, [page.path]: check.error }));
    setErrors((e) => ({ ...e, [page.path]: '' }));
    setConfirmError('');
    setConfirm({ page, to: check.to });
  }

  async function send(method, body) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin-route-aliases', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || 'That did not work. Please try again.');
      apply(data);
      return true;
    } catch (err) {
      setConfirmError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function doSave() {
    if (await send('PUT', { from: confirm.page.path, to: confirm.to })) {
      setNotice(`Saved. ${confirm.page.path} now opens at ${confirm.to}. Changes can take up to 15 seconds to show everywhere.`);
      setConfirm(null);
    }
  }

  async function doReset(page) {
    setConfirmError('');
    if (await send('DELETE', { from: page.path })) {
      setNotice(`${page.label} is back at ${page.path}.`);
    } else {
      setErrors((e) => ({ ...e, [page.path]: 'Could not reset. Please try again.' }));
    }
  }

  return (
    <AdminShell title="Page addresses" subtitle="Choose the web address each public page uses. Superadmins only.">
      {state === 'loading' && <p role="status">Loading...</p>}
      {state === 'denied' && <p role="alert">Only superadmins can change page addresses.</p>}
      {state === 'failed' && <p role="alert">Page addresses could not be loaded. Please reload the page.</p>}
      {state === 'ready' && (
        <>
          <p className="pa-warning">
            Renaming a page changes its web address for everyone. Old bookmarks, shared links and search results for the old
            address will be redirected to the new one, and links inside the site keep working because they redirect too.
            Rename sparingly, and tell members when you do.
          </p>
          {notice ? <p role="status" className="pa-notice">{notice}</p> : null}
          <table className="pa-table">
            <thead>
              <tr><th>Page</th><th>Address now</th><th>New address</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const value = drafts[page.path] ?? '';
                const err = errors[page.path];
                const inputId = `pa-${page.path.slice(1)}`;
                return (
                  <tr key={page.path}>
                    <td data-label="Page">
                      <div className="pa-name">{page.label}</div>
                      <div className="pa-badge">Built-in: {page.path}</div>
                    </td>
                    <td data-label="Address now"><span className="pa-code">{page.current}</span> {page.isDefault ? <span className="pa-badge">(default)</span> : <span className="pa-badge">(renamed)</span>}</td>
                    <td data-label="New address">
                      <label htmlFor={inputId} className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>New address for {page.label}</label>
                      <input
                        id={inputId}
                        className="pa-input"
                        value={value}
                        placeholder={`${page.path}-new`}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={err ? 'true' : 'false'}
                        aria-describedby={err ? `${inputId}-err` : undefined}
                        onChange={(e) => {
                          setDrafts((d) => ({ ...d, [page.path]: e.target.value }));
                          setErrors((x) => ({ ...x, [page.path]: '' }));
                        }}
                      />
                      {value.trim() ? <div className="pa-preview">Preview: yourdomain{value.trim()}</div> : null}
                      {err ? <div id={`${inputId}-err`} className="pa-error" role="alert">{err}</div> : null}
                    </td>
                    <td data-label="Actions">
                      <div className="pa-actions">
                        <Button onClick={() => onSave(page)} disabled={!value.trim() || busy}>Save</Button>
                        <Button variant="quiet" onClick={() => doReset(page)} disabled={page.isDefault || busy}>Reset to default</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      <AdminDialog
        open={Boolean(confirm)}
        title={confirm ? `Change ${confirm.page.label} to ${confirm.to}?` : ''}
        onClose={() => setConfirm(null)}
        role="alertdialog"
        busy={busy}
        footer={(
          <>
            <Button variant="quiet" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button onClick={doSave} disabled={busy}>{busy ? 'Saving...' : 'Change address'}</Button>
          </>
        )}
      >
        {confirm ? (
          <>
            <p>Old links to {confirm.page.path} will redirect to {confirm.to}.</p>
            {confirmError ? <p className="pa-error" role="alert">{confirmError}</p> : null}
          </>
        ) : null}
      </AdminDialog>
    </AdminShell>
  );
}
