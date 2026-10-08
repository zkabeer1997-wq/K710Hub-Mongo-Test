'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import ExportToGoogleDrive from '../../../../components/admin/ExportToGoogleDrive';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Field, Input, Select, Table } from '../../../../components/ui';
import TableFilters from '../../../../components/admin/TableFilters';
import { searchRow, compareValues, numericValue } from '../../../../lib/adminTable.mjs';
import { TIME_SLOTS, NOBLE_TIME_SLOTS } from '../../../../lib/nobleAdvisor.mjs';
import { schedule, OPEN_SPOT } from '../prepScheduler.mjs';
import { buildXlsx } from './xlsx.mjs';

const ALL_COLUMNS = [
  { key: 'in_game_name', label: 'In-game name' },
  { key: 'member_id', label: 'Member ID' },
  { key: 'want_construction', label: 'Construction?' },
  { key: 'construction_upgrades', label: 'Upgrades' },
  { key: 'ttg_used', label: 'TTG' },
  { key: 'tg_used', label: 'TG' },
  { key: 'want_research', label: 'Research?' },
  { key: 't11_troops', label: 'New T11' },
  { key: 'tg_dust', label: 'TG Dust' },
  { key: 'research_speedup_days', label: 'Research SU days' },
  { key: 'want_troop_training', label: 'Troop Training?' },
  { key: 'is_transfer', label: 'Transfer?' },
  { key: 'promoting_t11', label: 'Promoting T11?' },
  { key: 'troop_speedup_days', label: 'Troop SU days' },
  { key: 'avail_day1', label: 'Day 1 Times (Construction)' },
  { key: 'avail_day2', label: 'Day 2 Times (Research)' },
  { key: 'avail_day4', label: 'Day 4 Times (Troop Training)' },
  { key: 'avail_day5', label: 'Day 5 Times (Overflow)' },
  { key: 'created_at', label: 'Submitted' },
];

const SEARCH_KEYS = ['in_game_name', 'member_id'];

function cellValue(row, key) {
  if (key === 'created_at') return row.created_at ? new Date(row.created_at).toLocaleString() : '';
  const v = row[key];
  if (Array.isArray(v)) return v.join(', ');
  return v == null ? '' : String(v);
}

// Plain text for Discord: one line per booked 30-minute slot, UTC.
function daysAsText(days, title) {
  const lines = [`**${title}**`, 'All times are UTC (game time). Convert to your own time zone before the day.', ''];
  for (const d of days) {
    const booked = d.rows.filter((r) => r.member !== OPEN_SPOT);
    if (!booked.length) continue;
    lines.push(`**Day ${d.day} - ${d.position}**`);
    booked.forEach((r) => lines.push(`${r.time} UTC  ${r.member}`));
    lines.push('');
  }
  if (lines.length === 3) lines.push('No appointments booked yet.');
  return lines.join('\n').trim();
}

export default function PrepMinistersTable({ noble = false }) {
  const api = noble ? '/api/admin-noble-advisor' : '/api/admin-prep-backpack';
  const COLUMNS = noble ? ALL_COLUMNS.filter(col => ['in_game_name','member_id','want_troop_training','is_transfer','promoting_t11','troop_speedup_days','avail_day4','created_at'].includes(col.key)) : ALL_COLUMNS;
  const [transferFilter,setTransferFilter] = useState('');
  const [promotionFilter,setPromotionFilter] = useState('');
  const [slotFilter,setSlotFilter] = useState('');
  const [minSpeedups,setMinSpeedups] = useState('');
  const [sortKey,setSortKey] = useState('in_game_name');
  const [sortDir,setSortDir] = useState('asc');
  const [rows, setRows] = useState([]);
  const [cycleId, setCycleId] = useState('');
  const [cycles, setCycles] = useState([]);
  const [cycle, setCycle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [consFilter, setConsFilter] = useState('');
  const [resFilter, setResFilter] = useState('');
  const [ttFilter, setTtFilter] = useState('');
  const [result, setResult] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [copied, setCopied] = useState('');
  const router = useRouter();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const response = await fetch(cycleId ? `${api}?cycle=${encodeURIComponent(cycleId)}` : api);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error || 'Failed to load submissions.'); setLoading(false); return; }
      setRows(data.rows || []);
      setCycles(data.cycles || []);
      setCycle(data.cycle || null);
      setResult(null);
      setLoading(false);
    }
    load().catch(() => { setError('Unable to load submissions.'); setLoading(false); });
  }, [api, cycleId]);

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  const visibleRows = useMemo(() => {
    return rows.filter(row => {
      if (consFilter && row.want_construction !== consFilter) return false;
      if (resFilter && row.want_research !== resFilter) return false;
      if (ttFilter && row.want_troop_training !== ttFilter) return false;
      if (transferFilter && row.is_transfer !== transferFilter) return false;
      if (promotionFilter && row.promoting_t11 !== promotionFilter) return false;
      if (minSpeedups && numericValue(row.troop_speedup_days) < numericValue(minSpeedups)) return false;
      if (slotFilter && !(noble ? ['avail_day4'] : ['avail_day1','avail_day2','avail_day4','avail_day5']).some(key => (Array.isArray(row[key]) ? row[key] : String(row[key] || '').split(',').map(v=>v.trim())).includes(slotFilter))) return false;
      return searchRow(row, query, [...SEARCH_KEYS,'notes','construction_upgrades','t11_troops']);
    }).sort((a,b)=>compareValues(a[sortKey],b[sortKey],['troop_speedup_days','research_speedup_days','tg_used','ttg_used','tg_dust'].includes(sortKey))*(sortDir==='asc'?1:-1));
  }, [rows, query, consFilter, resFilter, ttFilter, transferFilter, promotionFilter, slotFilter, minSpeedups, sortKey, sortDir, noble]);

  // Each cycle has its own rows, so the schedule always uses every answer in the chosen cycle.
  const scheduleRows = rows;

  function makeSchedule() { const data = schedule(scheduleRows.map(row=>({...row,...Object.fromEntries(ARRAY_KEYS.map(key=>[key,Array.isArray(row[key])?row[key]:String(row[key] || '').split(',').map(v=>v.trim()).filter(Boolean)]))})), noble ? { day4Slots: NOBLE_TIME_SLOTS } : undefined); return noble ? {...data,days:data.days.filter(day=>day.day===4)} : data; }
  function handleGenerate() { setResult(makeSchedule()); }

  const saveTimers = useRef({});
  const ARRAY_KEYS = ['construction_upgrades', 't11_troops', 'avail_day1', 'avail_day2', 'avail_day4', 'avail_day5'];

  const saveVersions = useRef({});
  const pendingSaves = useRef(new Set());
  const failedSaves = useRef(new Set());
  const saveQueues = useRef({});
  useEffect(() => () => Object.values(saveTimers.current).forEach(clearTimeout), []);
  function refreshSaveStatus() {
    setSaveStatus(pendingSaves.current.size ? 'saving' : failedSaves.current.size ? 'error' : 'saved');
  }
  async function persistCell(rowId, key, value, version) {
    const timerKey = rowId + ':' + key;
    const payloadValue = ARRAY_KEYS.includes(key) ? String(value).split(',').map(s=>s.trim()).filter(Boolean) : value;
    try {
      const res = await fetch(api, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:rowId,key,value:payloadValue})});
      if (!res.ok) throw new Error('save failed');
      if (saveVersions.current[timerKey] === version) failedSaves.current.delete(timerKey);
    } catch {
      if (saveVersions.current[timerKey] === version) failedSaves.current.add(timerKey);
    } finally {
      if (saveVersions.current[timerKey] === version) pendingSaves.current.delete(timerKey);
      refreshSaveStatus();
    }
  }
  function updateCell(rowId, key, value) {
    setRows(prev=>prev.map(row=>row.id===rowId?{...row,[key]:value}:row));
    setResult(null);
    const timerKey = rowId + ':' + key;
    const version = (saveVersions.current[timerKey] || 0) + 1;
    saveVersions.current[timerKey] = version;
    pendingSaves.current.add(timerKey);
    refreshSaveStatus();
    clearTimeout(saveTimers.current[timerKey]);
    saveTimers.current[timerKey] = setTimeout(() => {
      saveQueues.current[rowId] = (saveQueues.current[rowId] || Promise.resolve()).then(()=>persistCell(rowId,key,value,version));
    }, 600);
  }

  async function copyText() {
    const data = result || makeSchedule();
    const text = daysAsText(data.days, noble ? 'Flamedragon Tyrant - Noble Advisor schedule' : 'KvK schedule');
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied. Paste it in Discord.');
    } catch {
      setCopied('Could not copy. Select the schedule below and copy by hand.');
      setResult(data);
    }
  }

  function exportExcel() {
    const data = result || makeSchedule();
    const sheets = data.days.map((d) => ({
      name: 'Day ' + d.day,
      aoa: [['Day ' + d.day, d.position], ['Start Time', 'Member'], ...d.rows.map((r) => [r.time, r.member])],
    }));
    const blob = buildXlsx(sheets);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (noble ? 'noble-advisor-schedule-' : 'prep-week-schedules-') + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <AdminShell title={noble ? "Noble Advisor Schedule" : "Prep Ministers"} subtitle={noble ? "Flamedragon Troop Training appointments" : "Manage prep minister requests"} onLogout={handleLogout}>
          <p className="admin-page-lead">{noble ? "Training bookings for Flamedragon. Priorities match KvK Day 4: transfers, T11 promotion, then speedup days. One slot per person per day." : "Backpack amounts and minister bookings submitted through KvK Prep."}</p>
          <div className="dashboard-stats" aria-label="Prep summary">
            <div><span>Total submissions</span><strong>{rows.length}</strong></div>
            <div><span>Showing</span><strong>{visibleRows.length}</strong></div>
          </div>
          <TableFilters query={query} onQuery={setQuery} shown={visibleRows.length} total={rows.length} placeholder="Name, player ID, or notes" onReset={()=>{setQuery('');setConsFilter('');setResFilter('');setTtFilter('');setTransferFilter('');setPromotionFilter('');setSlotFilter('');setMinSpeedups('');setSortKey('in_game_name');setSortDir('asc');}} filters={[
            ...(!noble ? [{key:'construction',label:'Construction',value:consFilter,onChange:setConsFilter,options:['Yes','No']},{key:'research',label:'Research',value:resFilter,onChange:setResFilter,options:['Yes','No']}] : []),
            {key:'training',label:'Troop Training',value:ttFilter,onChange:setTtFilter,options:['Yes','No']},
            {key:'transfer',label:'Transfer',value:transferFilter,onChange:setTransferFilter,options:['Yes','No']},
            {key:'promotion',label:'Promoting T11',value:promotionFilter,onChange:setPromotionFilter,options:['Yes','No']},
            {key:'slot',label:'Available at (UTC)',value:slotFilter,onChange:setSlotFilter,options:noble ? NOBLE_TIME_SLOTS : TIME_SLOTS},
          ]}>
            <label>Min. training speedup days<input type="number" min="0" value={minSpeedups} onChange={e=>setMinSpeedups(e.target.value)}/></label>
            <label>Sort by<select value={sortKey} onChange={e=>setSortKey(e.target.value)}>{COLUMNS.map(col=><option key={col.key} value={col.key}>{col.label}</option>)}</select></label>
            <label>Order<select value={sortDir} onChange={e=>setSortDir(e.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
          </TableFilters>
          <div className="admin-time-cutoff schedule-time-cutoff">
            <label htmlFor={noble ? 'noble-cycle' : 'prep-cycle'}>{noble ? 'Flamedragon cycle' : 'KvK cycle'}</label>
            <select id={noble ? 'noble-cycle' : 'prep-cycle'} value={cycleId || cycle?.id || ''} onChange={(event) => setCycleId(event.target.value)}>
              {cycles.map((c) => (<option key={c.id} value={c.id}>{c.label}{c.is_current ? ' (current)' : ''}</option>))}
            </select>
            <p>
              {cycle && !cycle.is_current ? 'Showing an earlier cycle. ' : ''}
              The schedule uses all {rows.length} answers saved in {cycle ? cycle.label : 'this cycle'}. Members start every new cycle with a fresh form.
            </p>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:18,alignItems:'center'}}>
            <Button variant="quiet" onClick={handleGenerate} disabled={loading || Boolean(error) || saveStatus==='saving' || saveStatus==='error'}>Generate full schedule</Button>
            <Button variant="quiet" onClick={exportExcel} disabled={loading || Boolean(error) || saveStatus==='saving' || saveStatus==='error'}>Download Excel</Button>
            <Button variant="quiet" onClick={copyText} disabled={loading || Boolean(error) || saveStatus==='saving' || saveStatus==='error'}>Copy as text for Discord</Button>
            {copied && <span role="status">{copied}</span>}
            <ExportToGoogleDrive
              title={`${noble ? 'K710 Noble Advisor Schedule' : 'K710 Prep Week Schedules'} — ${new Date().toISOString().slice(0, 10)}`}
              getSheets={() => {
                const data = result || makeSchedule();
                return data.days.map((d) => ({
                  name: 'Day ' + d.day,
                  aoa: [['Day ' + d.day, d.position], ['Start Time', 'Member'], ...d.rows.map((r) => [r.time, r.member])],
                }));
              }}
            />
            <span>Uses every answer in the chosen cycle, regardless of table filters.</span>
            {saveStatus && <span role="status">{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed — correct the edited value before generating.'}</span>}
          </div>
          {loading && <TableSkeleton columns={COLUMNS.length} rows={7} />}
          {error && <div className="status error">{error}</div>}
          {!loading && !error && (
            <Table className="stack-table">
              <thead><tr>{COLUMNS.map((col) => (<th key={col.key} aria-sort={sortKey===col.key ? (sortDir==='asc'?'ascending':'descending') : 'none'}><button type="button" className="admin-sort-btn" onClick={()=>{setSortKey(col.key);setSortDir(sortKey===col.key && sortDir==='asc'?'desc':'asc');}}>{col.label}{sortKey===col.key ? (sortDir==='asc'?' ↑':' ↓') : ''}</button></th>))}</tr></thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>{COLUMNS.map((col) => (<td key={col.key}>{col.key === 'created_at' ? cellValue(row, col.key) : (<input className="admin-cell-input" value={cellValue(row, col.key)} onChange={(e) => updateCell(row.id, col.key, e.target.value)} />)}</td>))}</tr>
                ))}
              </tbody>
            </Table>
          )}
          {result && (
            <div className="prep-results">
              <h2>Assigned schedules</h2>
              <p className="prep-slot-sub">Preview below. Each person gets at most one slot per day. Use Download Excel, Export to Google Drive or Copy as text to share it.</p>
              <div className="prep-results-grid">
                {result.days.map((d) => (
                  <div key={d.day} className="prep-day-card">
                    <h3>Day {d.day} &mdash; {d.position}</h3>
                    <table className="prep-day-table">
                      <thead><tr><th>Start Time</th><th>Member</th></tr></thead>
                      <tbody>
                        {d.rows.map((r, i) => (
                          <tr key={i} className={r.member === OPEN_SPOT ? 'open-spot' : ''}>
                            <td>{r.time}</td><td>{r.member}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}
    </AdminShell>
  );
}
