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

  // Rows with a typed new address that differs from what is live now.
  function changedPages() {
    return pages.filter((p) => {
      const d = (drafts[p.path] ?? '').trim();
      return d && d !== p.current;
    });
  }

  function onSaveAll() {
    const changed = changedPages();
    const nextErrors = {};
    const targets = [];
    for (const page of changed) {
      const draft = (drafts[page.path] ?? '').trim();
      // Check each row against the saved addresses plus the other rows being changed together.
      const others = rows().filter((r) => r.from !== page.path);
      for (const other of changed) {
        if (other.path === page.path) continue;
        const od = (drafts[other.path] ?? '').trim();
        if (od) others.push({ from: other.path, to: od.startsWith('/') ? od : `/${od}` });
      }
      const check = validateAlias(page.path, draft, others);
      if (!check.ok) nextErrors[page.path] = check.error;
      else targets.push({ page, to: check.to });
    }
    setErrors((e) => ({ ...e, ...nextErrors }));
    if (Object.keys(nextErrors).length || !targets.length) return;
    setConfirmError('');
    setConfirm({ targets });
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
    const done = [];
    for (const { page, to } of confirm.targets) {
      if (!(await send('PUT', { from: page.path, to }))) {
        setNotice(done.length ? `Saved ${done.length} of ${confirm.targets.length}. Fix the problem below and save again.` : '');
        return;
      }
      done.push(page.path);
      setDrafts((d) => ({ ...d, [page.path]: '' }));
    }
    setNotice(`Saved ${done.length} address${done.length === 1 ? '' : 'es'}. Changes can take up to 15 seconds to show everywhere.`);
    setConfirm(null);
  }

  function discardAll() {
    setDrafts({});
    setErrors({});
  }

  async function doReset(page) {
    setConfirmError('');
    if (await send('DELETE', { from: page.path })) {
      setDrafts((d) => ({ ...d, [page.path]: '' }));
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
              <tr><th>Page</th><th>Address now</th><th>New address</th><th>Reset</th></tr>
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
                        {!page.isDefault ? (
                          <button type="button" className="pa-reset" onClick={() => doReset(page)} disabled={busy}>Reset to {page.path}</button>
                        ) : value.trim() ? (
                          <button type="button" className="pa-reset" onClick={() => setDrafts((d) => ({ ...d, [page.path]: '' }))}>Clear</button>
                        ) : <span className="pa-badge">No change</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="pa-bar" role="region" aria-label="Save changes">
            <p className="pa-bar-status" role="status" aria-live="polite">
              {changedPages().length ? `${changedPages().length} unsaved change${changedPages().length === 1 ? '' : 's'}` : 'No changes'}
            </p>
            <Button variant="quiet" onClick={discardAll} disabled={!changedPages().length || busy}>Discard changes</Button>
            <Button onClick={onSaveAll} disabled={!changedPages().length || busy}>Save changes</Button>
          </div>
        </>
      )}
      <AdminDialog
        open={Boolean(confirm)}
        title={confirm ? `Change ${confirm.targets.length} page address${confirm.targets.length === 1 ? '' : 'es'}?` : ''}
        onClose={() => setConfirm(null)}
        role="alertdialog"
        busy={busy}
        footer={(
          <>
            <Button variant="quiet" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button onClick={doSave} disabled={busy}>{busy ? 'Saving...' : 'Change addresses'}</Button>
          </>
        )}
      >
        {confirm ? (
          <>
            <ul className="pa-confirm-list">
              {confirm.targets.map(({ page, to }) => <li key={page.path}>{page.label}: {page.current} becomes {to}. Old links redirect.</li>)}
            </ul>
            {confirmError ? <p className="pa-error" role="alert">{confirmError}</p> : null}
          </>
        ) : null}
      </AdminDialog>
    </AdminShell>
  );
}
