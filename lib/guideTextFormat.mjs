// Pure selection helpers behind the rich-text toolbar (textarea + markdown).
// Each returns { value, start, end } so the caller can restore the selection.

export function wrapSelection(value, start, end, before, after = before, placeholder = 'text') {
  const selected = value.slice(start, end);
  // Toggle off when the selection is already wrapped.
  if (selected && selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  const text = selected || placeholder;
  const next = value.slice(0, start) + before + text + after + value.slice(end);
  return { value: next, start: start + before.length, end: start + before.length + text.length };
}

export function makeLink(value, start, end, url) {
  const text = value.slice(start, end) || 'link text';
  const insert = `[${text}](${url})`;
  return { value: value.slice(0, start) + insert + value.slice(end), start: start + 1, end: start + 1 + text.length };
}

// Prefix every line touched by the selection with "- " or "1. " (or remove it).
export function toggleList(value, start, end, ordered = false) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = value.indexOf('\n', end);
  if (lineEnd < 0) lineEnd = value.length;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const marker = ordered ? /^\d+\.\s/ : /^[-*]\s/;
  const allMarked = lines.every(l => marker.test(l));
  const next = lines.map((l, i) => {
    if (allMarked) return l.replace(ordered ? /^\d+\.\s/ : /^[-*]\s/, '');
    return `${ordered ? `${i + 1}. ` : '- '}${l.replace(/^(\d+\.|[-*])\s/, '')}`;
  }).join('\n');
  return { value: value.slice(0, lineStart) + next + value.slice(lineEnd), start: lineStart, end: lineStart + next.length };
}
