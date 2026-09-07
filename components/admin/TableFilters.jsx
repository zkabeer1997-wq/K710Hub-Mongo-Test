'use client';
import { useId } from 'react';
export default function TableFilters({ query, onQuery, placeholder = 'Search names or player IDs', filters = [], onReset, shown, total, children }) {
  const id = useId();
  return <section className="table-filters" aria-label="Search and filters">
    <div className="table-filters-main">
      <label htmlFor={`${id}-search`}>Search<input id={`${id}-search`} type="search" value={query} placeholder={placeholder} onChange={e => onQuery(e.target.value)} /></label>
      <button type="button" onClick={onReset} className="table-filters-reset">Clear filters</button>
      <span className="table-filters-count" role="status">{shown} of {total} shown</span>
    </div>
    {(filters.length > 0 || children) && <div className="table-filters-options">{filters.map(filter => <label key={filter.key} htmlFor={`${id}-${filter.key}`}>{filter.label}<select id={`${id}-${filter.key}`} value={filter.value} onChange={e => filter.onChange(e.target.value)}><option value="">{filter.allLabel || 'All'}</option>{filter.options.map(option => typeof option === 'string' ? <option key={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}{children}</div>}
    <style>{`
      .admin-shell .table-filters{margin:18px 0;padding:16px;background:var(--panel,#15212b);border:1px solid var(--edge,#34404b);border-radius:10px}
      .admin-shell .table-filters-main{display:flex;align-items:end;gap:12px;flex-wrap:wrap}
      .admin-shell .table-filters label{display:flex;flex-direction:column;gap:6px;margin:0;color:inherit;font-size:12px;font-weight:700;text-align:left;text-transform:none;letter-spacing:0}
      .admin-shell .table-filters-main>label{flex:1;min-width:min(250px,100%)}
      .admin-shell .table-filters input,.admin-shell .table-filters select{width:100%;min-width:0;height:40px;margin:0;padding:8px 11px;background:var(--field-bg,#0e1821);color:var(--parchment,#eee);border:1px solid var(--edge,#45515b);border-radius:6px;font:inherit}
      .admin-shell .table-filters-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr));gap:12px;margin-top:14px;align-items:end}
      .admin-shell .table-filters-reset{height:40px;padding:8px 12px;margin:0;font-size:12px;font-weight:700;white-space:nowrap;width:auto;background:transparent;color:var(--parchment,#eee);border:1px solid var(--edge,#45515b);border-radius:6px;cursor:pointer}
      .admin-shell .table-filters-reset:hover{border-color:var(--gold,#d9a94e);color:var(--gold-bright,#f0c669)}
      .admin-shell .table-filters-count{font-size:12px;white-space:nowrap;padding-bottom:10px}
      @media(max-width:600px){.admin-shell .table-filters-main>label{flex-basis:100%}}
    `}</style>
  </section>;
}
