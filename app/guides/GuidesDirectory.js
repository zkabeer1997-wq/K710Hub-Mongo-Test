'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Field, Input } from '../../components/ui';
import GuideIcon from './GuideIcon';
import { guideCategories } from '../../lib/guideValidation.mjs';
import { formatGuideDate, guideSubtitle, guideUpdatedAt } from '../../lib/guideContent.mjs';

const updatedLabel = (guide) => formatGuideDate(guideUpdatedAt(guide));
import { guideDifficultyLabel, startHereSlug } from '../../lib/guideTags.mjs';

const DIFFICULTY_TONE = {
  Beginner: 'guide-tag-beginner',
  Intermediate: 'guide-tag-intermediate',
  Advanced: 'guide-tag-advanced',
};

export default function GuidesDirectory({ copy, guides, categories: savedCategories = [], query, backHref }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(null);

  // Only categories that hold at least one guide (an empty filter is a dead end).
  const categories = useMemo(() => {
    return guideCategories(guides, savedCategories).filter((c) => guides.some((g) => String(g.category || '').trim() === c));
  }, [guides, savedCategories]);
  // Search and filters help once the list is long; with a handful of guides they are clutter.
  const showControls = guides.length >= 8;

  // Computed from the full, unfiltered list so the badge stays put on the
  // same guide regardless of the current search/category filter.
  const startHere = useMemo(() => startHereSlug(guides), [guides]);

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
      {showControls && <div className="guides-toolbar">
        <Field label={copy.search_label} htmlFor="guide-search" className="guides-search">
          <Input
            id="guide-search"
            type="search"
            placeholder={copy.search_placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <div className="guides-categories" role="group" aria-label={copy.filter_label}>
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all-guides"}
              type="button"
              aria-pressed={category === c}
              className={`guides-category-tab ${category === c ? 'is-active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c ?? copy.filter_all}
            </button>
          ))}
        </div>
      </div>}

      {filtered.length === 0 ? (
        <div className="guides-error k-narrative">{search.trim() ? copy.empty_search : copy.empty_category}</div>
      ) : (
        <ul className="guides-directory">
          {filtered.map((guide, index) => {
            const difficulty = guideDifficultyLabel(guide);
            const isStartHere = Boolean(guide.slug) && guide.slug === startHere;
            return (
              <li key={guide.slug} className="guide-entry-item"><a href={`/guides/${guide.slug}${query}`} className="guide-entry">
                <GuideIcon index={index} imageUrl={guide.image_url} />
                <span className="guide-entry-copy">
                  <span className="guide-entry-tags">
                    <span className="k-mark guide-category">{guide.category}</span>
                    {isStartHere && (
                      <span className="guide-tag guide-tag-start" title="Recommended first guide">
                        ★ {copy.badge_start}
                      </span>
                    )}
                    {difficulty && (
                      <span className={`guide-tag ${DIFFICULTY_TONE[difficulty] || ''}`}>{difficulty}</span>
                    )}
                  </span>
                  <strong className="guide-entry-title">{guide.title}</strong>
                  {guideSubtitle(guide.title, guide.description) && <span className="guide-description">{guide.description}</span>}
                  <span className="guide-entry-sub">
                    {guide.reading_minutes || 1} {copy.entry_read_suffix}
                    {updatedLabel(guide) ? ` · ${copy.entry_updated_prefix} ${updatedLabel(guide)}` : ''}
                  </span>
                </span>
                <span className="guide-entry-meta">
                  <span>{copy.entry_open}</span>
                  <b aria-hidden="true">→</b>
                </span>
              </a></li>
            );
          })}
        </ul>
      )}

    </>
  );
}
