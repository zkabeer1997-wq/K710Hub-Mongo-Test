// Builds the two-tab rally workbook (Participants + Rally Teams) as a plain, styled sheet model.
// The same model feeds the .xlsx writer (lib/styledXlsx.mjs) and the Google Sheets writer (lib/sheetsRequests.mjs).
import { classifyAvailability, rallySlotCount, sortRalliesByType } from '../app/admin/dashboard/rallyState.mjs';

export const BLOCK_COLUMNS = 7;
export const BLOCKS_PER_BAND = 3;
export const COLUMN_WIDTHS = [3.2, 8.9, 13, 13, 5.1, 12, 8.9];
export const RALLY_HEADER_FILL = '#FF0000';
export const COLUMN_HEADER_FILL = '#FFFF00';
export const TIME_FILLS = { full: '#CCCCCC', first: '#FFF2CC', second: '#C9DAF8', other: '#FF00FF' };
export const SHEET_NAME_LIMIT = 31;

export function ordinal(n) {
  const v = Math.abs(Number(n)) % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
  return `${n}${suffix}`;
}

/** "Season 14" -> 14. A label with no number is returned as it is. */
export function cycleNumberOf(label) {
  const match = String(label || '').match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : String(label || '').trim();
}

export function sheetNames(eventType, cycleNumber) {
  const numeric = typeof cycleNumber === 'number' && cycleNumber > 0;
  const label = eventType === 'flamedragon'
    ? `Flamedragon ${numeric ? `S${cycleNumber}` : cycleNumber}`
    : (numeric ? `${ordinal(cycleNumber)} KvK` : `KvK ${cycleNumber}`);
  const clean = (name) => name.replace(/[:\\/?*[\]]/g, ' ').slice(0, SHEET_NAME_LIMIT);
  return { participants: clean(`Participants (${label})`), rallies: clean(`Rally Teams (${label})`) };
}

/** Which colour band an availability answer falls in: 'full' | 'first' | 'second' | 'other'. */
export function timeBucket(availability) {
  const bucket = classifyAvailability({ availability });
  return bucket === 'none' ? 'other' : bucket;
}

/** The value written in the Time column. Unrecognised answers are shown as the member wrote them. */
export function timeLabel(availability) {
  const text = String(availability || '').trim();
  const flame = /^12-15|^15-18|12-18/.test(text);
  switch (timeBucket(text)) {
    case 'full': return 'Full battle';
    case 'first': return flame ? '12:00-15:00' : '12:00-14:30';
    case 'second': return flame ? '15:00-18:00' : '14:30-17:00';
    default: return text.replace(/\s*\(.*\)\s*$/, '') || 'Unavailable';
  }
}

export function timeFill(availability) {
  return TIME_FILLS[timeBucket(availability)];
}

/** "T11 / TG8", "TG7" when no tier is known, "T10 / Below TG5". Blank when neither is known. */
export function troopCell(tier, tg) {
  return [tier, tg].map((v) => String(v || '').trim()).filter(Boolean).join(' / ');
}

function memberName(row) {
  return String(row?.name || row?.member_id || '');
}

function joinerRow(slot, row) {
  const fill = row ? timeFill(row.availability) : undefined;
  const base = { bold: true, font: 'Arial', align: 'center', ...(fill ? { bg: fill } : {}) };
  if (!row) return [{ ...base, size: 8, v: slot }, '', '', '', '', '', ''];
  const text = (v) => ({ ...base, size: 7, v });
  return [
    { ...base, size: 8, v: slot },
    text(troopCell(row.infantry_tier, row.infantry_tg)),
    text(troopCell(row.cavalry_tier, row.cavalry_tg)),
    text(troopCell(row.archer_tier, row.archer_tg)),
    text(String(row.current_alliance || '')),
    text(memberName(row)),
    text(timeLabel(row.availability)),
  ];
}

function rallyBlock(rally, rowsById) {
  const header = (v) => ({ v, bold: true, size: 12, font: 'Arial', align: 'center', bg: RALLY_HEADER_FILL });
  const slots = rallySlotCount(rally);
  const lines = [
    [header(rally.name || ''), header(''), header(''), header(''), header(''), header(''), header('')],
    [header(rally.managerName ? `Manager : ${rally.managerName}` : ' Manager :  '), header(''), header(''), header(''), header(''), header(''), header('')],
    ['', 'Inf', 'Cav', 'Arc', 'Ali', 'Name', 'T i m e'].map((v) => ({ v, bold: true, font: 'Arial', size: 10, align: 'center', bg: COLUMN_HEADER_FILL })),
  ];
  for (let i = 0; i < slots; i += 1) {
    const id = rally.memberIds[i];
    lines.push(joinerRow(i + 1, id == null ? null : rowsById.get(String(id)) || { name: id }));
  }
  const noteLines = String(rally.notes || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  noteLines.forEach((line) => {
    lines.push([{ v: line, bold: true, size: 8, font: 'Arial', align: 'left' }, '', '', '', '', '', '']);
  });
  return { lines, noteCount: noteLines.length, slots };
}

export function buildRallyTeamsSheet(name, rallies, rows) {
  const rowsById = new Map(rows.map((row) => [String(row.member_id), row]));
  const blocks = sortRalliesByType(rallies).map((rally) => rallyBlock(rally, rowsById));
  const sheet = {
    name,
    widths: Array.from({ length: BLOCK_COLUMNS * BLOCKS_PER_BAND }, (_, i) => COLUMN_WIDTHS[i % BLOCK_COLUMNS]),
    rows: [],
    merges: [],
    frozenRows: 0,
  };
  for (let start = 0; start < blocks.length; start += BLOCKS_PER_BAND) {
    const band = blocks.slice(start, start + BLOCKS_PER_BAND);
    const height = Math.max(...band.map((b) => b.lines.length));
    const top = sheet.rows.length;
    for (let r = 0; r < height; r += 1) {
      const row = [];
      for (let b = 0; b < BLOCKS_PER_BAND; b += 1) {
        const line = band[b]?.lines[r];
        for (let c = 0; c < BLOCK_COLUMNS; c += 1) row.push(line ? line[c] : '');
      }
      sheet.rows.push(row);
    }
    band.forEach((block, b) => {
      const col = b * BLOCK_COLUMNS;
      sheet.merges.push([top, col, top, col + BLOCK_COLUMNS - 1], [top + 1, col, top + 1, col + BLOCK_COLUMNS - 1]);
      for (let n = 0; n < block.noteCount; n += 1) {
        const r = top + 3 + block.slots + n;
        sheet.merges.push([r, col, r, col + BLOCK_COLUMNS - 1]);
      }
    });
    if (start + BLOCKS_PER_BAND < blocks.length) sheet.rows.push([]);
  }
  return sheet;
}

const PARTICIPANT_HEADERS = ['Name', 'Player ID', 'Alliance', 'Inf', 'Cav', 'Arc', 'Time', 'Rally'];
export const PARTICIPANT_WIDTHS = [18, 14, 9, 14, 14, 14, 13, 18];

export function buildParticipantsSheet(name, rallies, rows) {
  const rallyByMember = new Map();
  rallies.forEach((rally) => {
    [...rally.memberIds, rally.leadMemberId].filter(Boolean).forEach((id) => rallyByMember.set(String(id), rally.name));
  });
  const sorted = [...rows].sort((a, b) => (
    String(a.current_alliance || '').localeCompare(String(b.current_alliance || ''))
    || memberName(a).localeCompare(memberName(b))
  ));
  const head = PARTICIPANT_HEADERS.map((v) => ({ v, bold: true, font: 'Arial', size: 10, bg: COLUMN_HEADER_FILL, align: 'center' }));
  const body = sorted.map((row) => {
    const style = { font: 'Arial', size: 10, bg: timeFill(row.availability) };
    return [
      memberName(row), String(row.member_id || ''), String(row.current_alliance || ''),
      troopCell(row.infantry_tier, row.infantry_tg), troopCell(row.cavalry_tier, row.cavalry_tg), troopCell(row.archer_tier, row.archer_tg),
      timeLabel(row.availability), rallyByMember.get(String(row.member_id)) || '',
    ].map((v) => ({ ...style, v }));
  });
  return { name, widths: PARTICIPANT_WIDTHS, rows: [head, ...body], merges: [], frozenRows: 1 };
}

/** The whole export: Participants first, then Rally Teams. */
export function buildRallyWorkbook({ eventType, cycleNumber, rallies, rows }) {
  const names = sheetNames(eventType, cycleNumber);
  return [
    buildParticipantsSheet(names.participants, rallies, rows),
    buildRallyTeamsSheet(names.rallies, rallies, rows),
  ];
}
