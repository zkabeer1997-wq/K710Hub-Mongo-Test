'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import SectionTabs, { INBOX_TABS } from '../../../../components/admin/SectionTabs';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { REQUEST_STATUS_OPTIONS, normalizeRequestStatus } from '../../../../lib/adminInbox.mjs';
import { Input, Select, Table } from '../../../../components/ui';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'member_id', label: 'Player ID' },
  { key: 'current_alliance', label: 'Alliance' },
  { key: 'section', label: 'Section' },
  { key: 'message', label: 'Request' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Submitted' },
];

function cellValue(row, key) {
  if (key === 'name') return row.display_name || row.name || '';
  if (key === 'status') return normalizeRequestStatus(row.status);
  if (key === 'created_at') return row.created_at ? new Date(row.created_at).toLocaleString() : '';
  return row[key] == null ? '' : String(row[key]);
}

export default function AdminWebsiteRequestsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [savingId, setSavingId] = useState(null);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch('/api/admin-website-requests');
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Unable to load website requests.');
      } else {
        setRows(result.rows || []);
        if (result.configured === false) {
          setError('Website requests table not found. Apply the website_requests migration in Supabase.');
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'created_at' ? 'desc' : 'asc');
    }
  }

  async function changeStatus(row, nextStatus) {
    setSavingId(row.id);
    try {
      const response = await fetch(`/api/admin-website-requests/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update status.');
      window.dispatchEvent(new Event('admin-tasks-changed'));
      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, ...result.row } : r)));
    } catch (err) {
      setError(err.message || 'Could not update status.');
    } finally {
      setSavingId(null);
    }
  }

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = rows.filter((row) => COLUMNS.some((col) => cellValue(row, col.key).toLowerCase().includes(q)));
    }
    return [...list].sort((a, b) => {
      if (sortKey === 'created_at') {
        const av = Date.parse(a.created_at || '') || 0;
        const bv = Date.parse(b.created_at || '') || 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const av = cellValue(a, sortKey).toLowerCase();
      const bv = cellValue(b, sortKey).toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, query, sortKey, sortDir]);

  const newCount = rows.filter((r) => normalizeRequestStatus(r.status) === 'new').length;

  return (
    <AdminShell
      title="Inbox"
      subtitle="Requests from members and visitors that need an answer."
      onLogout={handleLogout}
      counters={[
        { label: 'Total', value: rows.length },
        { label: 'New', value: newCount },
      ]}
    >
      <SectionTabs tabs={INBOX_TABS} label="Inbox sections" />
      <div className="admin-toolbar">
        <Input
          tone="console"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search by name, ID, section, request..." placeholder="Search by name, ID, section, request..."
        />
        <span className="admin-count">{visibleRows.length} of {rows.length}</span>
      </div>

      {error && <div className="status error">{error}</div>}

      {loading ? (
        <TableSkeleton columns={COLUMNS.length} rows={7} />
      ) : (
        <div className="admin-table-wrap">
        <Table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} onClick={() => toggleSort(col.key)}>
                  {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length}>No requests yet.</td></tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.display_name || row.name || '-'}
                    {row.display_name_note && <div className="admin-row-message">{row.display_name_note}</div>}
                  </td>
                  <td className="member-id-cell">{row.member_id || '-'}</td>
                  <td><span className="unit-pill">{row.current_alliance || '-'}</span></td>
                  <td><span className="unit-pill">{row.section}</span></td>
                  <td className="member-detail-text" style={{ minWidth: 240, maxWidth: 420, whiteSpace: 'pre-wrap' }}>{row.message}</td>
                  <td>
                    <label className="sr-only" htmlFor={`req-status-${row.id}`}>Status for request from {row.display_name || row.member_id}</label>
                    <Select
                      id={`req-status-${row.id}`}
                      tone="console"
                      value={normalizeRequestStatus(row.status)}
                      disabled={savingId === row.id}
                      onChange={(e) => changeStatus(row, e.target.value)}
                    >
                      {REQUEST_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </td>
                  <td className="updated-cell">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        </div>
      )}
    </AdminShell>
  );
}
