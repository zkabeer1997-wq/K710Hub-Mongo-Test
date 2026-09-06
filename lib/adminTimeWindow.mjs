export function rowUpdatedTimestamp(row) {
  const value = row?.updated_at || row?.created_at;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function filterRowsUpdatedOnOrAfter(rows, cutoffValue) {
  if (!cutoffValue) return rows;
  const cutoffTimestamp = Date.parse(cutoffValue);
  if (!Number.isFinite(cutoffTimestamp)) return rows;
  return rows.filter((row) => rowUpdatedTimestamp(row) >= cutoffTimestamp);
}

export function compareRowsNewestFirst(a, b) {
  return rowUpdatedTimestamp(b) - rowUpdatedTimestamp(a);
}
