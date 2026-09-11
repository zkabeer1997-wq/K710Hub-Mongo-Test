'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Field, Input } from '../../components/ui';
import GuideIcon from './GuideIcon';
import { guideCategories } from '../../lib/guideValidation.mjs';

export default function GuidesDirectory({ guides, categories: savedCategories = [], query, backHref }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(null);

  const categories = useMemo(() => {
    return guideCategories(guides, savedCategories);
  }, [guides, savedCategories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return guides.filter((g) => {
      const matchesCategory = category === null || g.category === category;
      const matchesSearch =
        !q ||
        g.title.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [guides, search, category]);

  return (
    <>
      <div className="guides-toolbar">
        <Field label="Search guides" htmlFor="guide-search" className="guides-search">
          <Input
            id="guide-search"
            type="search"
            placeholder="Search by title or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <div className="guides-categories" role="group" aria-label="Filter by category">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all-guides"}
              type="button"
              aria-pressed={category === c}
              className={`guides-category-tab ${category === c ? 'is-active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c ?? 'All'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="guides-error k-narrative">{search.trim() ? 'No guides match your search.' : 'No published guides in this category yet.'}</div>
      ) : (
        <div className="guides-directory" role="list">
          {filtered.map((guide, index) => (
            <a key={guide.slug} href={`/guides/${guide.slug}${query}`} className="guide-entry" role="listitem">
              <GuideIcon index={index} />
              <span className="guide-entry-copy">
                <span className="k-mark guide-category">{guide.category}</span>
                <strong className="guide-entry-title">{guide.title}</strong>
                <span className="guide-description">{guide.description}</span>
                <span className="guide-entry-sub">
                  {guide.reading_minutes || 1} min read
                  {guide.updated_at ? ` · Updated ${new Date(guide.updated_at).toLocaleDateString()}` : ''}
                </span>
              </span>
              <span className="guide-entry-meta">
                <span>Open guide</span>
                <b aria-hidden="true">→</b>
              </span>
            </a>
          ))}
        </div>
      )}

      <Link href={backHref} className="guides-back">← Return to member page</Link>
    </>
  );
}
