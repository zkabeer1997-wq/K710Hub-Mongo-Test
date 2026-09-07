'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Field, Input, Select, Table } from '../../../../components/ui';
import TableFilters from '../../../../components/admin/TableFilters';
import { searchRow, compareValues, numericValue } from '../../../../lib/adminTable.mjs';
import { TIME_SLOTS } from '../../../../lib/nobleAdvisor.mjs';
import { schedule, OPEN_SPOT } from '../prepScheduler.mjs';
import { filterRowsUpdatedOnOrAfter } from '../../../../lib/adminTimeWindow.mjs';

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
  { key: 'updated_at', label: 'Updated' },
];

const SEARCH_KEYS = ['in_game_name', 'member_id'];

function cellValue(row, key) {
  if (key === 'updated_at') {
    const value = row.updated_at || row.created_at;
    return value ? new Date(value).toLocaleString() : '';
  }
  const v = row[key];
  if (Array.isArray(v)) return v.join(', ');
  return v == null ? '' : String(v);
}

function buildXlsx(sheets) {
  const xmlEscape = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const colName = (n) => { let s = ''; let x = n; while (x > 0) { const rem = (x - 1) % 26; s = String.fromCharCode(65 + rem) + s; x = Math.floor((x - 1) / 26); } return s; };
  const nsMain = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const nsRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const nsPkgRel = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const nsCT = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const sheetXmls = sheets.map((sheet) => {
    const rowsXml = sheet.aoa.map((cells, rIdx) => {
      const rowNum = rIdx + 1;
      const cellsXml = cells.map((val, cIdx) => {
        const ref = colName(cIdx + 1) + rowNum;
        const str = String(val == null ? '' : val);
        const isNum = str.trim() !== '' && !Number.isNaN(Number(str)) && /^-?\d+(\.\d+)?$/.test(str.trim());
        if (isNum) return '<c r="' + ref + '"><v>' + xmlEscape(str.trim()) + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(str) + '</t></is></c>';
      }).join('');
      return '<row r="' + rowNum + '">' + cellsXml + '</row>';
    }).join('');
    return decl + '<worksheet xmlns="' + nsMain + '"><sheetData>' + rowsXml + '</sheetData></worksheet>';
  });
  const overrides = sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');
  const contentTypes = decl + '<Types xmlns="' + nsCT + '">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides + '</Types>';
  const rootRels = decl + '<Relationships xmlns="' + nsPkgRel + '"><Relationship Id="rId1" Type="' + nsRel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const sheetTags = sheets.map((s, i) => '<sheet name="' + xmlEscape(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('');
  const workbook = decl + '<workbook xmlns="' + nsMain + '" xmlns:r="' + nsRel + '"><sheets>' + sheetTags + '</sheets></workbook>';
  const wbRelTags = sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + nsRel + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('');
  const workbookRels = decl + '<Relationships xmlns="' + nsPkgRel + '">' + wbRelTags + '</Relationships>';
  const files = [
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
  ];
  sheetXmls.forEach((xml, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: xml }));
  const crcTable = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i += 1) { let c = i; for (let k = 0; k < 8; k += 1) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } t[i] = c >>> 0; } return t; })();
  const crc32 = (bytes) => { let crc = 0xffffffff; for (let i = 0; i < bytes.length; i += 1) { crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8); } return (crc ^ 0xffffffff) >>> 0; };
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
    pushU32(local, 0x04034b50); pushU16(local, 20); pushU16(local, 0); pushU16(local, 0); pushU16(local, 0); pushU16(local, 0);
    pushU32(local, crc); pushU32(local, dataBytes.length); pushU32(local, dataBytes.length); pushU16(local, nameBytes.length); pushU16(local, 0);
    const localHeader = new Uint8Array(local);
    chunks.push(localHeader, nameBytes, dataBytes);
    const cen = [];
    pushU32(cen, 0x02014b50); pushU16(cen, 20); pushU16(cen, 20); pushU16(cen, 0); pushU16(cen, 0); pushU16(cen, 0); pushU16(cen, 0);
    pushU32(cen, crc); pushU32(cen, dataBytes.length); pushU32(cen, dataBytes.length); pushU16(cen, nameBytes.length); pushU16(cen, 0); pushU16(cen, 0); pushU16(cen, 0); pushU16(cen, 0); pushU32(cen, 0); pushU32(cen, offset);
    central.push({ header: new Uint8Array(cen), name: nameBytes });
    offset += localHeader.length + nameBytes.length + dataBytes.length;
  });
  const centralStart = offset;
  let centralSize = 0;
  central.forEach((entry) => { chunks.push(entry.header, entry.name); centralSize += entry.header.length + entry.name.length; });
  const end = [];
  pushU32(end, 0x06054b50); pushU16(end, 0); pushU16(end, 0); pushU16(end, files.length); pushU16(end, files.length); pushU32(end, centralSize); pushU32(end, centralStart); pushU16(end, 0);
  chunks.push(new Uint8Array(end));
  return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export default function AdminPrepMinistersPage({ noble = false }) {
  const api = noble ? '/api/admin-noble-advisor' : '/api/admin-prep-backpack';
  const COLUMNS = noble ? ALL_COLUMNS.filter(col => ['in_game_name','member_id','want_troop_training','is_transfer','promoting_t11','troop_speedup_days','avail_day4','updated_at'].includes(col.key)) : ALL_COLUMNS;
  const [transferFilter,setTransferFilter] = useState('');
  const [promotionFilter,setPromotionFilter] = useState('');
  const [slotFilter,setSlotFilter] = useState('');
  const [minSpeedups,setMinSpeedups] = useState('');
  const [sortKey,setSortKey] = useState('updated_at');
  const [sortDir,setSortDir] = useState('desc');
  const [scheduleCutoff, setScheduleCutoff] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [consFilter, setConsFilter] = useState('');
  const [resFilter, setResFilter] = useState('');
  const [ttFilter, setTtFilter] = useState('');
  const [result, setResult] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const router = useRouter();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch(api);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error || 'Failed to load submissions.'); setLoading(false); return; }
      setRows(data.rows || []);
      setLoading(false);
    }
    load().catch(() => { setError('Unable to load submissions.'); setLoading(false); });
  }, [api]);

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

  const scheduleRows = useMemo(
    () => filterRowsUpdatedOnOrAfter(rows, scheduleCutoff),
    [rows, scheduleCutoff],
  );
  function makeSchedule() { const data = schedule(scheduleRows.map(row=>({...row,...Object.fromEntries(ARRAY_KEYS.map(key=>[key,Array.isArray(row[key])?row[key]:String(row[key] || '').split(',').map(v=>v.trim()).filter(Boolean)]))}))); return noble ? {...data,days:data.days.filter(day=>day.day===4)} : data; }
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
    setRows(prev=>prev.map(row=>row.id===rowId?{...row,[key]:value,updated_at:new Date().toISOString()}:row));
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
          <p className="admin-page-lead">{noble ? "Training bookings for Flamedragon. Schedule priorities match KvK Day 4: transfers, T11 promotion, then speedup days." : "Backpack amounts and minister bookings submitted through KvK Prep."}</p>
          <div className="dashboard-stats" aria-label="Prep summary">
            <div><span>Total submissions</span><strong>{rows.length}</strong></div>
            <div><span>Showing</span><strong>{visibleRows.length}</strong></div>
          </div>
          <TableFilters query={query} onQuery={setQuery} shown={visibleRows.length} total={rows.length} placeholder="Name, player ID, or notes" onReset={()=>{setQuery('');setConsFilter('');setResFilter('');setTtFilter('');setTransferFilter('');setPromotionFilter('');setSlotFilter('');setMinSpeedups('');setSortKey('updated_at');setSortDir('desc');}} filters={[
            ...(!noble ? [{key:'construction',label:'Construction',value:consFilter,onChange:setConsFilter,options:['Yes','No']},{key:'research',label:'Research',value:resFilter,onChange:setResFilter,options:['Yes','No']}] : []),
            {key:'training',label:'Troop Training',value:ttFilter,onChange:setTtFilter,options:['Yes','No']},
            {key:'transfer',label:'Transfer',value:transferFilter,onChange:setTransferFilter,options:['Yes','No']},
            {key:'promotion',label:'Promoting T11',value:promotionFilter,onChange:setPromotionFilter,options:['Yes','No']},
            {key:'slot',label:'Available at (UTC)',value:slotFilter,onChange:setSlotFilter,options:TIME_SLOTS},
          ]}>
            <label>Min. training speedup days<input type="number" min="0" value={minSpeedups} onChange={e=>setMinSpeedups(e.target.value)}/></label>
            <label>Sort by<select value={sortKey} onChange={e=>setSortKey(e.target.value)}>{COLUMNS.map(col=><option key={col.key} value={col.key}>{col.label}</option>)}</select></label>
            <label>Order<select value={sortDir} onChange={e=>setSortDir(e.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
          </TableFilters>
          <div className="admin-time-cutoff schedule-time-cutoff">
            <label htmlFor={noble ? 'noble-schedule-cutoff' : 'prep-schedule-cutoff'}>Use submissions updated from</label>
            <input
              id={noble ? 'noble-schedule-cutoff' : 'prep-schedule-cutoff'}
              type="datetime-local"
              value={scheduleCutoff}
              onChange={(event) => { setScheduleCutoff(event.target.value); setResult(null); }}
            />
            {scheduleCutoff && <button type="button" onClick={() => { setScheduleCutoff(''); setResult(null); }}>Use all submissions</button>}
            <p>
              Schedule generation will use {scheduleRows.length} of {rows.length} submissions.
              {scheduleCutoff ? ' Older submissions remain in the table.' : ''}
            </p>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:18,alignItems:'center'}}>
            <Button variant="quiet" onClick={handleGenerate} disabled={loading || Boolean(error) || saveStatus==='saving' || saveStatus==='error'}>Generate full schedule</Button>
            <Button variant="quiet" onClick={exportExcel} disabled={loading || Boolean(error) || saveStatus==='saving' || saveStatus==='error'}>Export schedule to Excel</Button>
            <span>Uses the update time frame above, regardless of table filters.</span>
            {saveStatus && <span role="status">{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed — correct the edited value before generating.'}</span>}
          </div>
          {loading && <TableSkeleton columns={COLUMNS.length} rows={7} />}
          {error && <div className="status error">{error}</div>}
          {!loading && !error && (
            <Table>
              <thead><tr>{COLUMNS.map((col) => (<th key={col.key} aria-sort={sortKey===col.key ? (sortDir==='asc'?'ascending':'descending') : 'none'}><button type="button" className="admin-sort-btn" onClick={()=>{setSortKey(col.key);setSortDir(sortKey===col.key && sortDir==='asc'?'desc':'asc');}}>{col.label}{sortKey===col.key ? (sortDir==='asc'?' ↑':' ↓') : ''}</button></th>))}</tr></thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>{COLUMNS.map((col) => (<td key={col.key}>{col.key === 'updated_at' ? cellValue(row, col.key) : (<input className="admin-cell-input" value={cellValue(row, col.key)} onChange={(e) => updateCell(row.id, col.key, e.target.value)} />)}</td>))}</tr>
                ))}
              </tbody>
            </Table>
          )}
          {result && (
            <div className="prep-results">
              <h2>Assigned schedules</h2>
              <p className="prep-slot-sub">Preview below. Use Export to Excel to download. Multi-slot Troop Training players are marked with *.</p>
              <div className="prep-results-grid">
                {result.days.map((d) => (
                  <div key={d.day} className="prep-day-card">
                    <h3>Day {d.day} &mdash; {d.position}</h3>
                    <table className="prep-day-table">
                      <thead><tr><th>Start Time</th><th>Member</th></tr></thead>
                      <tbody>
                        {d.rows.map((r, i) => (
                          <tr key={i} className={r.member === OPEN_SPOT ? 'open-spot' : ''}>
                            <td>{r.time}</td><td>{r.member}{r.multi ? ' *' : ''}</td>
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
