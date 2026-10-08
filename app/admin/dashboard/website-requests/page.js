'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import SectionTabs, { INBOX_TABS } from '../../../../components/admin/SectionTabs';
import StatusBadge from '../../../../components/admin/StatusBadge';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Input, Table } from '../../../../components/ui';

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

  async function toggleStatus(row) {
    const nextStatus = row.status === 'reviewed' ? 'new' : 'reviewed';
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
      setRows((current) => current.map((r) => (r.id === row.id ? result.row : r)));
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

  const newCount = rows.filter((r) => r.status !== 'reviewed').length;

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
        <Table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} onClick={() => toggleSort(col.key)}>
                  {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1}>No requests yet.</td></tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name || '-'}</td>
                  <td className="member-id-cell">{row.member_id || '-'}</td>
                  <td><span className="unit-pill">{row.current_alliance || '-'}</span></td>
                  <td><span className="unit-pill">{row.section}</span></td>
                  <td className="member-detail-text" style={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>{row.message}</td>
                  <td><StatusBadge status={row.status} label={row.status === 'reviewed' ? 'Reviewed' : 'New'} /></td>
                  <td className="updated-cell">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td>
                  <td>
                    <Button
                      variant="quiet"
                      onClick={() => toggleStatus(row)}
                      disabled={savingId === row.id}
                    >
                      {savingId === row.id ? 'Saving...' : row.status === 'reviewed' ? 'Mark new' : 'Mark reviewed'}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
    </AdminShell>
  );
}
