// Small text helpers shared by the Packs/Tools admin editors.
export function stampText(iso, emptyText = 'Not saved yet.') {
  if (!iso) return emptyText;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `Last saved ${d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}

/** Parse a text input into a finite number, or NaN when blank/invalid. */
export function toNumber(raw) {
  if (typeof raw === 'number') return raw;
  const text = String(raw ?? '').trim();
  return text === '' ? Number.NaN : Number(text);
}
