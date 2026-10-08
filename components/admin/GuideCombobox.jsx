'use client';

import { useId, useMemo, useState } from 'react';

// Searchable picker for the "Linked guide" field. Stores the guide slug.
export default function GuideCombobox({ guides, value, onChange, id }) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const current = guides.find(guide => guide.slug === value);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guides.filter(guide => !q || guide.title.toLowerCase().includes(q) || guide.slug.includes(q)).slice(0, 50);
  }, [guides, query]);
  return (
    <div className="evf-combo">
      <input id={id} className="evf-input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        placeholder={value ? '' : 'Search guides…'}
        value={open ? query : (current ? current.title : value || '')}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {value ? <button type="button" className="evf-combo-clear" onClick={() => { onChange(''); setQuery(''); }}>No guide</button> : null}
      {open && (
        <ul id={listId} role="listbox" className="evf-combo-list" aria-label="Published guides">
          {matches.length === 0 ? <li className="evf-combo-empty">No published guide matches.</li> : matches.map(guide => (
            <li key={guide.slug} role="presentation">
              <button type="button" role="option" aria-selected={guide.slug === value} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(guide.slug); setOpen(false); }}>
                <b>{guide.title}</b><small>/guides/{guide.slug}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <small className="evf-hint">{value ? `Members who select this event go to /guides/${value}.` : 'Optional. Without a guide, members open the event detail page.'}</small>
    </div>
  );
}
