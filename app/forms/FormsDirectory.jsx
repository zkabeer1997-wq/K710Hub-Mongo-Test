'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { completionLabel, isCompleted } from '../../lib/formCompletion.mjs';
import { Term } from '../../components/ui';

// Persists only the collapsed/expanded preference now. The recommended order
// lives inline on the page (not behind a popup), so returning members who
// already know the order can tuck it away without ever meeting a modal.
const ORDER_COLLAPSED_KEY = 'k710-forms-order-collapsed';

// `detail` is JSX (not a plain string) for the steps that introduce jargon,
// so the first mention on the page can gloss it with <Term>. This is the
// suggested-order list, not a Link, so nesting a <button> trigger inside it
// is safe (unlike the form tiles below, which are Links and cannot nest one).
const ORDER_STEPS = [
  {
    title: 'Gear Tracking',
    detail: (
      <>
        Update your <Term term="Governor Gear">Governor Gear</Term>, Charms, Pets, Masters, and{' '}
        <Term term="Mystic Trial">Mystic Trial</Term> first. This keeps your power record current for every event.
      </>
    ),
  },
  {
    title: 'KvK Prep Phase Backpack & KvK Availability',
    detail: (
      <>
        If a <Term term="KvK">Kingdom vs Kingdom</Term> event is upcoming, fill out the KvK Prep Phase Backpack form
        and the KvK Availability form next.
      </>
    ),
  },
  {
    title: 'Flamedragon Tyrant & Noble Advisor Schedule',
    detail: (
      <>
        If <Term term="Flamedragon Tyrant">Flamedragon Tyrant</Term> is upcoming, complete the Flamedragon Tyrant
        form and the Noble Advisor Schedule form.
      </>
    ),
  },
];

const FORMS = [
  {
    key: 'lead',
    group: 'Always first',
    title: 'Gear Tracking',
    description:
      'Update your Governor Gear, Charms, Pets, Masters, and Mystic Trial so leadership has accurate power data.',
    href: (id) => `/power-profile?member_id=${id}`,
  },
  {
    key: 'kvk-hub',
    group: 'When KvK is upcoming',
    title: 'KvK Forms',
    description:
      'KvK Prep Phase Backpack and KvK Availability — fill these when a Kingdom vs Kingdom event is approaching.',
    href: (id) => `/forms/kvk?member_id=${id}`,
    ungated: true,
  },
  {
    key: 'dragon-hub',
    group: 'When Flamedragon is upcoming',
    title: 'Flamedragon Tyrant Forms',
    description:
      'Flamedragon Tyrant and Noble Advisor Schedule — use these when the Flamedragon Tyrant event is approaching.',
    href: (id) => `/forms/flamedragon-tyrant?member_id=${id}`,
    ungated: true,
  },
  {
    key: 'requests',
    group: 'Anytime',
    title: 'Website Requests',
    description: 'Suggest an improvement or report an issue with K710 Hub.',
    href: (id) => `/forms/requests?member_id=${id}`,
  },
];

function FormGlyph({ formKey }) {
  const common = { viewBox: '0 0 48 48', 'aria-hidden': true, className: 'forms-menu-glyph' };
  if (formKey === 'lead') {
    return (
      <svg {...common}>
        <path
          d="M24 6 L38 12 V24 C38 34 31 40 24 43 C17 40 10 34 10 24 V12 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="22" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (formKey === 'kvk-hub') {
    return (
      <svg {...common}>
        <rect x="10" y="12" width="28" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <path d="M16 20 H32 M16 26 H28 M16 32 H30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (formKey === 'dragon-hub') {
    return (
      <svg {...common}>
        <path
          d="M12 30 C16 18 22 12 24 12 C26 12 32 18 36 30 C30 34 18 34 12 30 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M20 22 L24 18 L28 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path
        d="M14 10 H30 L36 16 V38 H14 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M30 10 V16 H36 M18 24 H30 M18 30 H26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FormOrderStepper({ collapsed, onToggle }) {
  return (
    <section className="forms-order" aria-labelledby="forms-order-title">
      <div className="forms-order-head">
        <div className="forms-order-heading">
          <span className="k-mark">Member instructions</span>
          <h2 id="forms-order-title" className="k-display">
            Suggested form order
          </h2>
          <p className="k-narrative forms-order-lede">
            Complete forms in this order so leadership has the information they need at the right time.
          </p>
          <Link href="/glossary" className="forms-glossary-link">What do these terms mean?</Link>
        </div>
        <button
          type="button"
          className="forms-order-toggle"
          aria-expanded={!collapsed}
          aria-controls="forms-order-steps"
          onClick={onToggle}
        >
          {collapsed ? 'Show the order' : 'Hide'}
        </button>
      </div>

      <ol className="forms-order-steps" id="forms-order-steps" hidden={collapsed}>
        {ORDER_STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="forms-order-num" aria-hidden="true">
              {index + 1}
            </span>
            <span className="forms-order-body">
              <strong>{step.title}</strong>
              <span>{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function FormsDirectory({ memberId = '', closedKeys = [], completions = {} }) {
  const encoded = encodeURIComponent(memberId || '');
  // Expanded by default so the recommended order is visible on arrival; a
  // stored preference collapses it for members who have seen it before.
  const [orderCollapsed, setOrderCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (window.localStorage.getItem(ORDER_COLLAPSED_KEY) === '1') {
        setOrderCollapsed(true);
      }
    } catch {
      /* private mode: leave the guide expanded */
    }
  }, []);

  function toggleOrder() {
    setOrderCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(ORDER_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  return (
    <section className="forms-catalog">
      <FormOrderStepper collapsed={orderCollapsed} onToggle={toggleOrder} />

      <div className="forms-menu-grid" role="list">
        {FORMS.map((form) => {
          const isClosed = !form.ungated && closedKeys.includes(form.key);
          const label = completionLabel(completions[form.key]);
          const done = isCompleted(completions[form.key]);
          return (
            <Link
              key={form.key}
              href={form.href(encoded)}
              className="forms-menu-tile"
              role="listitem"
              data-closed={isClosed || undefined}
              aria-disabled={isClosed || undefined}
            >
              {isClosed && <span className="forms-menu-badge">Closed</span>}
              <span className="forms-menu-icon">
                <FormGlyph formKey={form.key} />
              </span>
              <span className="k-mark forms-menu-group">{form.group}</span>
              <strong className="k-display forms-menu-title">{form.title}</strong>
              <span className="forms-menu-desc">
                {isClosed ? 'This form is closed for now.' : form.description}
              </span>
              <span
                className="forms-menu-status"
                data-done={done || undefined}
                aria-label={done ? `Status: ${label}` : 'Status: not yet submitted'}
              >
                <b aria-hidden="true">{done ? '✓' : '○'}</b>
                {label}
              </span>
              <span className="forms-menu-cta">
                {isClosed ? 'Unavailable' : 'Open form'} <b aria-hidden="true">→</b>
              </span>
            </Link>
          );
        })}
      </div>

      <style>{`
        .forms-catalog{color:var(--parchment)}

        .forms-order{
          margin-bottom:26px;padding:20px 22px;border:1px solid rgba(201,164,78,.2);border-radius:12px;
          background:linear-gradient(180deg,rgba(20,17,10,.55),rgba(9,10,18,.6));
        }
        .forms-order-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:14px}
        .forms-order-heading{min-width:0}
        .forms-order-heading h2{margin:8px 0 8px;font-size:clamp(1.2rem,2.6vw,1.5rem);color:#f6eedc}
        .forms-order-lede{margin:0;max-width:60ch;color:var(--parchment-dim);font-size:14px;line-height:1.55}
        .forms-glossary-link{display:inline-block;margin-top:10px;color:var(--gold-hot);font-size:12px;font-weight:600;text-decoration:underline;text-underline-offset:3px}
        .forms-glossary-link:hover{color:var(--gold-hot);opacity:.85}
        .forms-order-toggle{
          flex:none;border:1px solid rgba(201,164,78,.35);background:rgba(201,164,78,.08);color:var(--gold-hot);
          font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
          padding:9px 14px;border-radius:8px;cursor:pointer;transition:border-color .16s ease,background .16s ease;
        }
        .forms-order-toggle:hover{border-color:rgba(201,164,78,.7);background:rgba(201,164,78,.14)}
        .forms-order-toggle:focus-visible{outline:2px solid var(--gold-hot);outline-offset:2px}
        .forms-order-steps{
          list-style:none;margin:18px 0 0;padding:0;
          display:grid;grid-template-columns:repeat(3,1fr);gap:14px;
        }
        .forms-order-steps[hidden]{display:none}
        .forms-order-steps li{
          display:grid;grid-template-columns:auto 1fr;align-items:start;gap:12px;
          padding:14px 14px;border-radius:10px;border:1px solid rgba(201,164,78,.16);background:rgba(255,255,255,.03);
        }
        .forms-order-num{
          display:grid;place-items:center;width:28px;height:28px;border-radius:999px;
          background:rgba(201,164,78,.14);border:1px solid rgba(201,164,78,.4);color:var(--gold-hot);
          font-family:var(--font-mono);font-size:13px;font-weight:700;
        }
        .forms-order-body{display:grid;gap:5px;min-width:0}
        .forms-order-body strong{color:#f3e7c8;font-size:.95rem;line-height:1.3}
        .forms-order-body span{color:var(--parchment-dim);font-size:.86rem;line-height:1.5}

        .forms-menu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
        .forms-menu-tile{
          position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:10px;
          min-height:260px;padding:28px 22px 22px;border:1px solid rgba(201,164,78,.24);border-radius:10px;
          background:linear-gradient(180deg,rgba(20,17,10,.7),rgba(9,10,18,.86));
          text-decoration:none;color:inherit;
          transition:transform .18s var(--ease-cine,ease),border-color .18s ease,box-shadow .18s ease,background .18s ease;
        }
        .forms-menu-tile:hover,.forms-menu-tile:focus-visible{
          transform:translateY(-4px);border-color:rgba(201,164,78,.7);outline:none;
          box-shadow:0 14px 30px rgba(0,0,0,.4),0 0 0 1px rgba(201,164,78,.2);
          background:linear-gradient(180deg,rgba(28,23,13,.82),rgba(11,12,21,.92));
        }
        .forms-menu-tile[data-closed="true"]{opacity:.72}
        .forms-menu-badge{
          position:absolute;top:12px;right:12px;font-family:var(--font-mono);font-size:9.5px;font-weight:700;
          letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
          background:rgba(198,83,48,.16);color:#ffb4a2;border:1px solid rgba(198,83,48,.3);
        }
        .forms-menu-icon{width:56px;height:56px;display:grid;place-items:center;color:var(--gold-hot)}
        .forms-menu-glyph{width:44px;height:44px}
        .forms-menu-group{color:var(--brass);font-size:10px;letter-spacing:.08em}
        .forms-menu-title{font-size:clamp(16px,2vw,19px);letter-spacing:.04em;color:var(--parchment);line-height:1.25}
        .forms-menu-desc{color:var(--parchment-dim);font-size:13px;line-height:1.55;flex:1}
        .forms-menu-status{
          display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:10.5px;
          font-weight:700;letter-spacing:.04em;color:var(--parchment-dim);
        }
        .forms-menu-status b{font-size:11px;font-weight:700;color:var(--parchment-dim)}
        .forms-menu-status[data-done="true"]{color:var(--gold-hot)}
        .forms-menu-status[data-done="true"] b{color:var(--gold-hot)}
        .forms-menu-cta{
          margin-top:auto;padding-top:10px;font-family:var(--font-mono);font-size:11px;font-weight:700;
          letter-spacing:.06em;text-transform:uppercase;color:var(--gold-hot);display:inline-flex;align-items:center;gap:6px;
        }
        .forms-menu-cta b{font-family:var(--font-body);font-weight:400;font-size:14px;transition:transform .18s var(--ease-cine,ease)}
        .forms-menu-tile:hover .forms-menu-cta b{transform:translateX(3px)}

        @media(max-width:860px){
          .forms-order-steps{grid-template-columns:1fr}
        }
        @media(max-width:700px){
          .forms-menu-grid{grid-template-columns:1fr}
          .forms-order-head{align-items:stretch}
          .forms-order-toggle{width:100%}
        }
        @media(prefers-reduced-motion:reduce){
          .forms-menu-tile,.forms-menu-cta b,.forms-order-toggle{transition:none}
        }
      `}</style>
    </section>
  );
}
