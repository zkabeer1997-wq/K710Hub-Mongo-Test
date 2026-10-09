'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import SectionTabs, { INBOX_TABS } from '../../../../components/admin/SectionTabs';
import StatusBadge from '../../../../components/admin/StatusBadge';
import ExportToGoogleDrive from '../../../../components/admin/ExportToGoogleDrive';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { sortPeriodsNewestFirst } from '../../../../lib/adminOverview.mjs';
import DriveStatusBanner from '../../../../components/admin/DriveStatusBanner';
import { Button, Field, Input, Select, Table } from '../../../../components/ui';
import { useEscapeToClose } from '../../../../lib/useEscapeToClose';
import { decisionConfirmText, acceptanceMessage, findDuplicateApplicants } from '../../../../lib/adminInbox.mjs';

const COMPACT_COLUMNS = [
  { key: 'in_game_name', label: 'Name' },
  { key: 'verified', label: 'Verification' },
  { key: 'current_server', label: 'Server' },
  { key: 'current_alliance', label: 'Alliance' },
  { key: 'migrate_alliance', label: 'Target' },
  { key: 'highest_troop_level', label: 'Troop Level' },
  { key: 't11_units', label: 'T11' },
  { key: 'mystic_trial_score', label: 'Mystic Trial score' },
  { key: 'total_power', label: 'Power' },
  { key: 'passes_required', label: 'Passes' },
  { key: 'intake_period', label: 'Intake' },
  { key: 'created_at', label: 'Submitted' },
];

const COLUMNS = [
  { key: 'status', label: 'Status' },
  { key: 'verified', label: 'Verification' },
  { key: 'in_game_name', label: 'In-game name' },
  { key: 'player_id', label: 'Player ID' },
  { key: 'discord_username', label: 'Discord' },
  { key: 'current_server', label: 'Current server' },
  { key: 'current_alliance', label: 'Current alliance' },
  { key: 'intake_period', label: 'Intake period' },
  { key: 'migrate_alliance', label: 'Migrating to' },
  { key: 'highest_troop_level', label: 'Troop level' },
  { key: 'current_tg', label: 'TG' },
  { key: 't11_units', label: 'T11' },
  { key: 'mystic_trial_score', label: 'Total Mystic Trial Score' },
  { key: 'total_power', label: 'Total Power' },
  { key: 'willing_reduce_power', label: 'Reduce power' },
  { key: 'passes_required', label: 'Passes required' },
  { key: 'current_passes', label: 'Current passes' },
  { key: 'active_commit', label: 'Active commit' },
  { key: 'willing_save_resources', label: 'Save resources' },
  { key: 'participates_battles', label: 'Battles' },
  { key: 'spending_archetype', label: 'Spending' },
  { key: 'main_language', label: 'Language' },
  { key: 'created_at', label: 'Submitted (latest)' },
  { key: 'first_submitted_at', label: 'First submitted' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'resubmitted_count', label: 'Resubmitted (times)' },
  { key: 'verified_at', label: 'Verified at' },
  { key: 'stats_fetched_at', label: 'Game data read at' },
  { key: 'power_self_reported', label: 'Power self-reported' },
  { key: 'mystic_self_reported', label: 'Mystic Trial self-reported' },
];

const EXPORT_COLUMNS = COLUMNS.filter((c) => c.key !== 'status');

const NUMERIC_KEYS = new Set(['total_power', 'mystic_trial_score', 'current_tg', 'passes_required', 'current_passes', 'resubmitted_count']);
const DATE_KEYS = new Set(['created_at', 'first_submitted_at', 'updated_at', 'verified_at', 'stats_fetched_at']);
const VERIFICATION_TABS = [{ id: '', label: 'All' }, { id: 'verified', label: 'Verified' }, { id: 'unverified', label: 'Unverified' }];
const SEARCH_KEYS = ['in_game_name', 'current_server', 'player_id', 'current_alliance'];

const STATUS_ACTIONS = [
  { value: 'special', label: 'Accept as Special', className: 'status-btn accept-special' },
  { value: 'normal', label: 'Accept as Normal', className: 'status-btn accept-normal' },
  { value: 'reject', label: 'Reject', className: 'status-btn reject' },
  { value: 'waitlist', label: 'Waitlist', className: 'status-btn waitlist' },
];

const STATUS_LABELS = {
  pending: 'Pending',
  special: 'Accepted (Special)',
  normal: 'Accepted (Normal)',
  reject: 'Rejected',
  waitlist: 'Waitlisted',
};

const STATUS_TABS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'waitlist', label: 'Waitlisted' },
  { id: 'reject', label: 'Rejected' },
];

function matchesStatusTab(row, tab) {
  if (!tab) return true;
  const status = row.status || 'pending';
  if (tab === 'accepted') return status === 'special' || status === 'normal';
  return status === tab;
}

// Rows saved before applicant verification existed have no `verified` field.
function verificationState(row) {
  if (row.verified === true) return 'verified';
  if (row.verified === false) return 'unverified';
  return 'legacy';
}

const VERIFICATION_LABELS = { verified: 'Verified', unverified: 'Unverified', legacy: 'Unverified (older application)' };

// The Mystic Trial figure used to be "stages cleared" (0-4000) under mystic_trial_stages.
function mysticValue(row) {
  if (row.mystic_trial_score != null && row.mystic_trial_score !== '') return String(row.mystic_trial_score);
  if (row.mystic_trial_stages != null && row.mystic_trial_stages !== '') return `${row.mystic_trial_stages} (old form: stages)`;
  return '';
}

// A number typed by someone who WAS verified is flagged. (Unverified rows are self-reported as a whole.)
function selfReported(row, key) {
  if (row.verified !== true) return false;
  if (key === 'total_power') return row.power_self_reported === true;
  if (key === 'mystic_trial_score') return row.mystic_self_reported === true;
  return false;
}

function cellValue(row, key) {
  if (key === 'status') return STATUS_LABELS[row.status] || 'Pending';
  if (key === 'verified') return VERIFICATION_LABELS[verificationState(row)];
  if (key === 't11_units') return (row.t11_units || []).join(', ');
  if (DATE_KEYS.has(key)) return row[key] ? new Date(row[key]).toLocaleString() : '';
  if (key === 'mystic_trial_score') return mysticValue(row) + (selfReported(row, key) ? ' (self-reported)' : '');
  if (key === 'total_power') return (row.total_power == null ? '' : String(row.total_power)) + (selfReported(row, key) ? ' (self-reported)' : '');
  if (key === 'power_self_reported' || key === 'mystic_self_reported') {
    if (row.verified !== true) return row.verified === false ? 'Yes (unverified)' : '';
    return row[key] === true ? 'Yes' : 'No';
  }
  if (key === 'resubmitted_count') return String(Number(row.resubmitted_count) || 0);
  return row[key] == null ? '' : String(row[key]);
}

// Text + icon, never colour alone.
function VerifiedBadge({ row }) {
  const state = verificationState(row);
  return (
    <span className={`verify-badge is-${state}`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        {state === 'verified'
          ? <path fill="currentColor" d="M8 1 2 3.5v4.2c0 3.2 2.5 6 6 7.3 3.5-1.3 6-4.1 6-7.3V3.5L8 1Zm-1 9.3L4.7 8l1-1L7 8.3 10.3 5l1 1L7 10.3Z" />
          : <path fill="currentColor" d="M8 1 2 3.5v4.2c0 3.2 2.5 6 6 7.3 3.5-1.3 6-4.1 6-7.3V3.5L8 1Zm-.8 3.5h1.6v4H7.2v-4Zm0 5h1.6v1.6H7.2V9.5Z" />}
      </svg>
      {VERIFICATION_LABELS[state]}
    </span>
  );
}

function buildMatcher(query) {
  const q = query.trim();
  if (!q) return null;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (q.includes('%')) {
    const pattern = '^' + escaped.split('%').join('.*') + '$';
    try { return new RegExp(pattern, 'i'); } catch (e) { return null; }
  }
  try { return new RegExp(escaped, 'i'); } catch (e) { return null; }
}

export default function AdminInterestPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [intakeFilter, setIntakeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [migrateFilter, setMigrateFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [serverFilter, setServerFilter] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [busyId, setBusyId] = useState('');
  const [rowMessage, setRowMessage] = useState({});
  const [accepted, setAccepted] = useState(null);
  const [pendingDecision, setPendingDecision] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [newPeriodLabel, setNewPeriodLabel] = useState('');
  const [newPeriodActivate, setNewPeriodActivate] = useState(true);
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [periodError, setPeriodError] = useState('');
  const [waitingForDrive, setWaitingForDrive] = useState(0);
  const [moveState, setMoveState] = useState({ running: false, message: '' });
  const router = useRouter();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch('/api/admin-interest-submissions');
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Unable to load submissions.');
      } else {
        setRows(result.rows || []);
        setWaitingForDrive(result.waitingForDrive || 0);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Applications whose screenshots could not reach Drive wait in MongoDB (temporary fallback).
  async function moveScreenshotsToDrive() {
    const skipIds = []; let moved = 0;
    setMoveState({ running: true, message: '' });
    try {
      for (let guard = 0; guard < 200; guard += 1) {
        const response = await fetch('/api/admin-interest-submissions/migrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skipIds }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Moving screenshots failed.');
        moved += result.migrated.length;
        result.failed.forEach((item) => skipIds.push(item.id));
        if (!result.remaining || (!result.migrated.length && !result.failed.length)) break;
      }
      const listed = await (await fetch('/api/admin-interest-submissions')).json();
      if (listed.rows) { setRows(listed.rows); setWaitingForDrive(listed.waitingForDrive || 0); }
      setMoveState({ running: false, message: `Moved screenshots for ${moved} application${moved === 1 ? '' : 's'} to Google Drive.${skipIds.length ? ` ${skipIds.length} could not be moved; try again later.` : ''}` });
    } catch (err) { setMoveState({ running: false, message: err.message }); }
  }

  async function loadPeriods() {
    setPeriodsLoading(true);
    try {
      const response = await fetch('/api/admin-intake-periods', { cache: 'no-store' });
      const result = await response.json();
      if (response.ok) setPeriods(result.periods || []);
    } finally {
      setPeriodsLoading(false);
    }
  }

  useEffect(() => { loadPeriods(); }, []);

  async function createPeriod(event) {
    event.preventDefault();
    const label = newPeriodLabel.trim();
    if (!label) {
      setPeriodError('Label is required.');
      return;
    }
    setSavingPeriod(true);
    setPeriodError('');
    try {
      const response = await fetch('/api/admin-intake-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, activate: newPeriodActivate }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create intake period.');
      await loadPeriods();
      if (newPeriodActivate) setIntakeFilter(label);
      setShowAddPeriod(false);
      setNewPeriodLabel('');
      setNewPeriodActivate(true);
    } catch (err) {
      setPeriodError(err.message || 'Unable to create intake period.');
    } finally {
      setSavingPeriod(false);
    }
  }

  async function activatePeriod(period) {
    setPeriodError('');
    try {
      const response = await fetch(`/api/admin-intake-periods/${period.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to activate intake period.');
      await loadPeriods();
    } catch (err) {
      setPeriodError(err.message || 'Unable to activate intake period.');
    }
  }

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  async function updateStatus(row, status, note) {
    setBusyId(row.id);
    setRowMessage((prev) => ({ ...prev, [row.id]: '' }));
    try {
      const response = await fetch('/api/admin-interest-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status, ...(note !== undefined ? { note } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setRowMessage((prev) => ({ ...prev, [row.id]: result.error || 'Update failed.' }));
        return;
      }
      window.dispatchEvent(new Event('admin-tasks-changed'));
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: result.row.status, decided_at: result.row.decided_at, admin_note: result.row.admin_note } : r)));
      setPendingDecision(null);
      if (result.account) {
        setAccepted({
          rowId: row.id,
          name: result.account.name,
          playerId: result.account.player_id,
          reused: Boolean(result.account.userExisted || result.account.recordExisted || result.account.profileExisted),
          message: acceptanceMessage({ name: result.account.name, playerId: result.account.player_id, origin: window.location.origin }),
        });
        setCopied(false);
      } else {
        setRowMessage((prev) => ({ ...prev, [row.id]: 'Status updated to ' + (STATUS_LABELS[status] || status) + '.' }));
      }
    } catch (err) {
      setRowMessage((prev) => ({ ...prev, [row.id]: 'Update failed: ' + err.message }));
    } finally {
      setBusyId('');
    }
  }

  const migrateOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.migrate_alliance).filter(Boolean))).sort(),
    [rows]
  );
  const serverOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.current_server).filter(Boolean))).sort(),
    [rows]
  );

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  const duplicates = useMemo(() => findDuplicateApplicants(rows), [rows]);

  function closeDrawer() {
    setSelectedId(null);
    setPendingDecision(null);
    setAccepted(null);
  }
  function openRow(id) {
    setSelectedId(id);
    setPendingDecision(null);
    setAccepted(null);
    setCopied(false);
  }
  function startDecision(row, status) {
    setPendingDecision(status);
    setDecisionNote(row.admin_note || '');
    setRowMessage((prev) => ({ ...prev, [row.id]: '' }));
  }
  async function copyMessage(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  useEscapeToClose(Boolean(selectedRow), closeDrawer);

  const visibleRows = useMemo(() => {
    const matcher = buildMatcher(query);
    let out = rows.filter((row) => {
      if (intakeFilter && row.intake_period !== intakeFilter) return false;
      if (!matchesStatusTab(row, statusFilter)) return false;
      if (verificationFilter === 'verified' && row.verified !== true) return false;
      if (verificationFilter === 'unverified' && row.verified === true) return false;
      if (migrateFilter && row.migrate_alliance !== migrateFilter) return false;
      if (serverFilter && row.current_server !== serverFilter) return false;
      if (matcher) {
        const hit = SEARCH_KEYS.some((key) => matcher.test(String(row[key] || '')));
        if (!hit) return false;
      }
      return true;
    });
    out = out.slice().sort((a, b) => {
      let av = sortKey === 'mystic_trial_score' ? (a.mystic_trial_score ?? a.mystic_trial_stages) : sortKey === 'verified' ? verificationState(a) : a[sortKey];
      let bv = sortKey === 'mystic_trial_score' ? (b.mystic_trial_score ?? b.mystic_trial_stages) : sortKey === 'verified' ? verificationState(b) : b[sortKey];
      if (NUMERIC_KEYS.has(sortKey)) {
        av = parseFloat(av) || 0;
        bv = parseFloat(bv) || 0;
      } else if (DATE_KEYS.has(sortKey)) {
        av = a[sortKey] ? new Date(a[sortKey]).getTime() : 0;
        bv = b[sortKey] ? new Date(b[sortKey]).getTime() : 0;
      } else {
        av = String(av == null ? '' : av).toLowerCase();
        bv = String(bv == null ? '' : bv).toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return out;
  }, [rows, query, intakeFilter, statusFilter, verificationFilter, migrateFilter, serverFilter, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function exportExcel() {
    const header = EXPORT_COLUMNS.map((c) => c.label);
    const dataRows = visibleRows.map((row) => EXPORT_COLUMNS.map((c) => cellValue(row, c.key)));
    const allRows = [header, ...dataRows];

    const xmlEscape = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const colName = (n) => {
      let s = '';
      let x = n;
      while (x > 0) {
        const rem = (x - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        x = Math.floor((x - 1) / 26);
      }
      return s;
    };

    const sheetRows = allRows.map((cells, rIdx) => {
      const rowNum = rIdx + 1;
      const cellsXml = cells.map((val, cIdx) => {
        const ref = colName(cIdx + 1) + rowNum;
        const str = String(val == null ? '' : val);
        const num = str.trim() !== '' && !Number.isNaN(Number(str)) && /^-?\d+(\.\d+)?$/.test(str.trim());
        if (num) {
          return '<c r="' + ref + '"><v>' + xmlEscape(str.trim()) + '</v></c>';
        }
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(str) + '</t></is></c>';
      }).join('');
      return '<row r="' + rowNum + '">' + cellsXml + '</row>';
    }).join('');

    const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>' + sheetRows + '</sheetData></worksheet>';

    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>';

    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Interest Submissions" sheetId="1" r:id="rId1"/></sheets></workbook>';

    const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>';

    const files = [
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rootRels },
      { name: 'xl/workbook.xml', data: workbook },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
      { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
    ];

    const crcTable = (() => {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c >>> 0;
      }
      return table;
    })();

    const crc32 = (bytes) => {
      let crc = 0xffffffff;
      for (let i = 0; i < bytes.length; i += 1) {
        crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
      }
      return (crc ^ 0xffffffff) >>> 0;
    };

    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    const pushU16 = (arr, v) => { arr.push(v & 0xff, (v >>> 8) & 0xff); };
    const pushU32 = (arr, v) => { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); };

    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = encoder.encode(file.data);
      const crc = crc32(dataBytes);

      const local = [];
      pushU32(local, 0x04034b50);
      pushU16(local, 20);
      pushU16(local, 0);
      pushU16(local, 0);
      pushU16(local, 0);
      pushU16(local, 0);
      pushU32(local, crc);
      pushU32(local, dataBytes.length);
      pushU32(local, dataBytes.length);
      pushU16(local, nameBytes.length);
      pushU16(local, 0);
      const localHeader = new Uint8Array(local);

      chunks.push(localHeader, nameBytes, dataBytes);

      const cen = [];
      pushU32(cen, 0x02014b50);
      pushU16(cen, 20);
      pushU16(cen, 20);
      pushU16(cen, 0);
      pushU16(cen, 0);
      pushU16(cen, 0);
      pushU16(cen, 0);
      pushU32(cen, crc);
      pushU32(cen, dataBytes.length);
      pushU32(cen, dataBytes.length);
      pushU16(cen, nameBytes.length);
      pushU16(cen, 0);
      pushU16(cen, 0);
      pushU16(cen, 0);
      pushU16(cen, 0);
      pushU32(cen, 0);
      pushU32(cen, offset);
      central.push({ header: new Uint8Array(cen), name: nameBytes });

      offset += localHeader.length + nameBytes.length + dataBytes.length;
    });

    const centralStart = offset;
    let centralSize = 0;
    central.forEach((entry) => {
      chunks.push(entry.header, entry.name);
      centralSize += entry.header.length + entry.name.length;
    });

    const end = [];
    pushU32(end, 0x06054b50);
    pushU16(end, 0);
    pushU16(end, 0);
    pushU16(end, files.length);
    pushU16(end, files.length);
    pushU32(end, centralSize);
    pushU32(end, centralStart);
    pushU16(end, 0);
    chunks.push(new Uint8Array(end));

    const blob = new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'interest-submissions-' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell title="Inbox" subtitle="Requests from members and visitors that need an answer." onLogout={handleLogout}>
          <SectionTabs tabs={INBOX_TABS} label="Inbox sections" />

          <div className="admin-subtabs" role="tablist" aria-label="Intake periods">
            <button
              type="button"
              role="tab"
              aria-selected={intakeFilter === ''}
              className={`admin-subtab${intakeFilter === '' ? ' is-active' : ''}`}
              onClick={() => setIntakeFilter('')}
            >
              All
            </button>
            {sortPeriodsNewestFirst(periods).map((period) => (
              <button
                key={period.id}
                type="button"
                role="tab"
                aria-selected={intakeFilter === period.label}
                className={`admin-subtab${intakeFilter === period.label ? ' is-active' : ''}`}
                onClick={() => setIntakeFilter(period.label)}
              >
                {period.label}{period.is_active ? <span className="admin-subtab-current"> (current)</span> : null}
              </button>
            ))}
            {!periodsLoading && (
              <button type="button" className="admin-subtab admin-subtab-add" onClick={() => setShowAddPeriod((v) => !v)}>
                + Add Intake Period
              </button>
            )}
          </div>

          {showAddPeriod && (
            <form onSubmit={createPeriod} className="intake-period-form">
              {periodError && <p className="guide-message error" role="alert">{periodError}</p>}
              <Field label="New intake period label" hint="e.g. November 2026">
                <Input tone="console" value={newPeriodLabel} onChange={(e) => setNewPeriodLabel(e.target.value)} aria-label="November 2026" placeholder="November 2026" autoFocus />
              </Field>
              <label className="intake-period-activate">
                <input type="checkbox" checked={newPeriodActivate} onChange={(e) => setNewPeriodActivate(e.target.checked)} />
                Make this the active intake period
              </label>
              <div className="intake-period-form-actions">
                <Button type="submit" disabled={savingPeriod}>{savingPeriod ? 'Saving…' : 'Add period'}</Button>
                <Button variant="quiet" onClick={() => { setShowAddPeriod(false); setPeriodError(''); }} disabled={savingPeriod}>Cancel</Button>
              </div>
            </form>
          )}

          <div className="admin-subtabs" role="tablist" aria-label="Status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id || 'all'}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.id}
                className={`admin-subtab${statusFilter === tab.id ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="dashboard-stats" aria-label="Interest summary">
            <div>
              <span>Total submissions</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <span>Showing</span>
              <strong>{visibleRows.length}</strong>
            </div>
          </div>
          <div className="admin-filter-bar">
            <Field label="Search (name, server, player ID, alliance)">
              <Input tone="console" className="narrow" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the inbox" placeholder="e.g. Legend" />
            </Field>
            <Field label="Verification">
              <Select tone="console" value={verificationFilter} onChange={(e) => setVerificationFilter(e.target.value)}>
                {VERIFICATION_TABS.map((tab) => (<option key={tab.id || 'all'} value={tab.id}>{tab.label}</option>))}
              </Select>
            </Field>
            <Field label="Migrating to">
              <Select tone="console" value={migrateFilter} onChange={(e) => setMigrateFilter(e.target.value)}>
                <option value="">All</option>
                {migrateOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
              </Select>
            </Field>
            <Field label="Current server">
              <Select tone="console" value={serverFilter} onChange={(e) => setServerFilter(e.target.value)}>
                <option value="">All</option>
                {serverOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
              </Select>
            </Field>
            <Button variant="quiet" onClick={exportExcel}>Export to Excel</Button>
            <ExportToGoogleDrive
              title={`K710 Transfer Requests — ${new Date().toISOString().slice(0, 10)}`}
              getSheets={() => [{
                name: 'Interest Submissions',
                aoa: [EXPORT_COLUMNS.map((c) => c.label), ...visibleRows.map((row) => EXPORT_COLUMNS.map((c) => cellValue(row, c.key)))],
              }]}
            />
          </div>
          {loading && <TableSkeleton columns={COMPACT_COLUMNS.length + 1} rows={7} />}
          {error && <div className="status error">{error}</div>}
          <DriveStatusBanner />
          {waitingForDrive > 0 && (
            <div className="status error" role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <span>{waitingForDrive} application{waitingForDrive === 1 ? ' has' : 's have'} screenshots waiting to move to Drive.</span>
              <Button onClick={moveScreenshotsToDrive} disabled={moveState.running} style={{ minHeight: 44 }}>{moveState.running ? 'Moving…' : 'Move to Drive'}</Button>
            </div>
          )}
          {moveState.message && <div className="status" role="status">{moveState.message}</div>}
          {!loading && !error && (
            <>
              <Table className="admin-compact-table stack-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    {COMPACT_COLUMNS.map((col) => (
                      <th key={col.key}>
                        <button type="button" onClick={() => toggleSort(col.key)} className="admin-sort-btn">
                          {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.id} className="admin-row-clickable" onClick={() => openRow(row.id)}>
                      <td><StatusBadge status={row.status || 'pending'} label={STATUS_LABELS[row.status] || 'Pending'} /></td>
                      {COMPACT_COLUMNS.map((col) => (
                        <td key={col.key} className={col.key === 'created_at' ? 'updated-cell' : undefined}>
                          {col.key === 'verified' ? <VerifiedBadge row={row} /> : cellValue(row, col.key).replace(' (self-reported)', '')}
                          {(col.key === 'total_power' || col.key === 'mystic_trial_score') && selfReported(row, col.key) && (
                            <> <span className="unit-pill" title="Typed by the applicant, not read from the game">Self-reported</span></>
                          )}
                          {col.key === 'created_at' && Number(row.resubmitted_count) > 0 && (
                            <> <span className="unit-pill" title={`First submitted ${row.first_submitted_at ? new Date(row.first_submitted_at).toLocaleString() : ''}`}>Resubmitted {row.resubmitted_count}x</span></>
                          )}
                          {col.key === 'in_game_name' && row.unverified_duplicate_of && (
                            <> <span className="unit-pill" title="Sent with the Player ID of a verified application, not verified itself">Unverified copy</span></>
                          )}
                          {col.key === 'in_game_name' && duplicates.has(row.id) && (
                            <>
                              {' '}
                              <span className="unit-pill" title="Another request uses the same Player ID">Duplicate</span>
                              {' '}
                              <button type="button" className="admin-sort-btn" onClick={(e) => { e.stopPropagation(); openRow(duplicates.get(row.id)[0]); }}>
                                See other
                              </button>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
              {visibleRows.length === 0 && <p>No interest submissions match your filters.</p>}
            </>
          )}

          <style>{`
            .inbox-confirm,.inbox-accepted{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.03)}
            .inbox-confirm p,.inbox-accepted p{margin:0}
            .inbox-note-label{font-size:12px;color:var(--text-muted)}
            .inbox-confirm textarea,.inbox-message{width:100%;font:inherit;font-size:13px;padding:8px;border-radius:6px;border:1px solid var(--line);background:rgba(0,0,0,.25);color:inherit;resize:vertical}
            .inbox-message{font-family:var(--font-mono-loaded),ui-monospace,monospace;font-size:12px}
            .status-action-btn.active-confirm{border-color:var(--gold);color:var(--parchment)}
            .verify-badge{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px;border:1px solid var(--line)}
            .verify-badge.is-verified{color:var(--gold);border-color:var(--gold)}
            .verify-badge.is-unverified,.verify-badge.is-legacy{color:var(--text-muted);border-style:dashed}
          `}</style>
          {selectedRow && (
            <div className="admin-drawer-overlay" role="presentation" onClick={closeDrawer}>
              <div className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="review-drawer-title" onClick={(e) => e.stopPropagation()}>
                <div className="admin-drawer-header">
                  <h2 id="review-drawer-title">{selectedRow.in_game_name || 'Applicant'}</h2>
                  <button type="button" className="admin-drawer-close" onClick={closeDrawer} aria-label="Close">&times;</button>
                </div>

                {duplicates.has(selectedRow.id) && (
                  <div className="admin-drawer-section">
                    <p className="admin-row-message" role="note">
                      Duplicate: another request uses Player ID {selectedRow.player_id}.{' '}
                      {duplicates.get(selectedRow.id).map((otherId) => {
                        const other = rows.find((r) => r.id === otherId);
                        return (
                          <button key={otherId} type="button" className="admin-sort-btn" onClick={() => openRow(otherId)}>
                            Open {other?.in_game_name || 'other request'} ({STATUS_LABELS[other?.status] || 'Pending'})
                          </button>
                        );
                      })}
                    </p>
                  </div>
                )}

                <div className="admin-drawer-section">
                  <h3>Decision</h3>
                  <p className="admin-row-message">Current: <strong>{STATUS_LABELS[selectedRow.status] || 'Pending'}</strong></p>
                  {accepted && accepted.rowId === selectedRow.id ? (
                    <div className="inbox-accepted" role="status">
                      <strong>{accepted.reused ? `${accepted.name} already had an account. Accepted.` : `${accepted.name} is accepted and can sign in.`}</strong>
                      <p className="admin-row-message">Player ID {accepted.playerId}. Send them this message so they know how to sign in.</p>
                      <textarea className="inbox-message" readOnly rows={8} value={accepted.message} aria-label="Message for Discord" onFocus={(e) => e.target.select()} />
                      <div className="admin-drawer-actions">
                        <button type="button" className="status-action-btn" onClick={() => copyMessage(accepted.message)}>
                          {copied ? 'Copied' : 'Copy message for Discord'}
                        </button>
                        <button type="button" className="status-action-btn" onClick={() => setAccepted(null)}>Done</button>
                      </div>
                    </div>
                  ) : pendingDecision ? (
                    <div className="inbox-confirm" role="group" aria-label="Confirm decision">
                      <p><strong>{decisionConfirmText(pendingDecision, selectedRow.in_game_name)}</strong></p>
                      <label className="inbox-note-label" htmlFor="decision-note">Internal note (optional, members never see it)</label>
                      <textarea id="decision-note" rows={2} maxLength={500} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
                      <div className="admin-drawer-actions">
                        <button type="button" className="status-action-btn active-confirm" disabled={busyId === selectedRow.id} onClick={() => updateStatus(selectedRow, pendingDecision, decisionNote)}>
                          {busyId === selectedRow.id ? 'Saving...' : `Yes, ${STATUS_ACTIONS.find((a) => a.value === pendingDecision)?.label.toLowerCase() || 'save'}`}
                        </button>
                        <button type="button" className="status-action-btn" disabled={busyId === selectedRow.id} onClick={() => setPendingDecision(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="admin-drawer-actions">
                      {STATUS_ACTIONS.map((action) => {
                        const isCurrent = selectedRow.status === action.value;
                        return (
                          <button
                            key={action.value}
                            type="button"
                            disabled={busyId === selectedRow.id}
                            aria-pressed={isCurrent}
                            onClick={() => startDecision(selectedRow, action.value)}
                            className={'status-action-btn' + (isCurrent ? ' active-' + action.value : '')}
                          >
                            {action.label}{isCurrent ? ' (current)' : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedRow.admin_note && !pendingDecision && <p className="admin-row-message">Note: {selectedRow.admin_note}</p>}
                  {rowMessage[selectedRow.id] && <p className="admin-row-message">{rowMessage[selectedRow.id]}</p>}
                </div>

                <div className="admin-drawer-section">
                  <h3>Verification</h3>
                  <p className="admin-row-message"><VerifiedBadge row={selectedRow} /></p>
                  {verificationState(selectedRow) === 'verified' && (
                    <p className="admin-row-message">
                      Name, Player ID, server and alliance{selectedRow.power_self_reported ? '' : ', power'}{selectedRow.mystic_self_reported ? '' : ' and Mystic Trial score'} were read from the game{selectedRow.stats_fetched_at ? ` on ${new Date(selectedRow.stats_fetched_at).toLocaleString()}` : ''}.
                      {selectedRow.power_self_reported ? ' Power was typed by the applicant (self-reported).' : ''}{selectedRow.mystic_self_reported ? ' Mystic Trial score was typed by the applicant (self-reported).' : ''}
                    </p>
                  )}
                  {verificationState(selectedRow) !== 'verified' && (
                    <p className="admin-row-message">Everything on this application was typed by the applicant. Check it against the screenshots before you accept.</p>
                  )}
                  {selectedRow.unverified_duplicate_of && (
                    <p className="admin-row-message">
                      This was sent with the Player ID of a verified application and is not verified itself.{' '}
                      <button type="button" className="admin-sort-btn" onClick={() => openRow(selectedRow.unverified_duplicate_of)}>Open the verified application</button>
                    </p>
                  )}
                  {Number(selectedRow.resubmitted_count) > 0 && (
                    <p className="admin-row-message">
                      Resubmitted {selectedRow.resubmitted_count} time{Number(selectedRow.resubmitted_count) === 1 ? '' : 's'}. This is the latest version; first submitted {selectedRow.first_submitted_at ? new Date(selectedRow.first_submitted_at).toLocaleString() : 'earlier'}.
                      {selectedRow.previous_status ? ` It was ${STATUS_LABELS[selectedRow.previous_status] || selectedRow.previous_status} before and is pending again.` : ''}
                    </p>
                  )}
                </div>

                <div className="admin-drawer-section">
                  <h3>Application</h3>
                  <div className="admin-drawer-grid">
                    {COLUMNS.filter((c) => c.key !== 'status' && c.key !== 'verified').map((col) => (
                      <div key={col.key} className="admin-drawer-field">
                        <span>{col.label}</span>
                        <strong>{cellValue(selectedRow, col.key) || '-'}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {(selectedRow.screenshot_urls || []).length > 0 && (
                  <div className="admin-drawer-section">
                    <h3>Screenshots</h3>
                    <div className="admin-drawer-actions">
                      {selectedRow.screenshot_urls.map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" className="status-action-btn">Image {index + 1}{selectedRow.screenshot_names?.[index] ? ` (${selectedRow.screenshot_names[index]})` : ''}</a>
                      ))}
                      {selectedRow.drive_folder_link && (
                        <a href={selectedRow.drive_folder_link} target="_blank" rel="noreferrer" className="status-action-btn">Open applicant folder in Drive</a>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8, marginTop: 10 }}>
                      {selectedRow.screenshot_urls.map((url, index) => (
                        <a key={`thumb-${url}`} href={url} target="_blank" rel="noreferrer" aria-label={`Open screenshot ${index + 1}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Screenshot ${index + 1} of ${selectedRow.in_game_name || 'the applicant'}`} loading="lazy" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#090b0f', borderRadius: 4 }} />
                        </a>
                      ))}
                    </div>
                    {selectedRow.screenshots_in_db > 0 && <p className="hint">{selectedRow.screenshots_in_db} screenshot{selectedRow.screenshots_in_db === 1 ? ' is' : 's are'} still stored in the database and will move to Drive.</p>}
                  </div>
                )}
              </div>
            </div>
          )}
    </AdminShell>
  );
}
