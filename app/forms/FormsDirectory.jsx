'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const GUIDE_STORAGE_KEY = 'k710-forms-order-guide-dismissed';

const FORMS = [
  {
    key: 'lead',
    group: 'Always first',
    title: 'Player Profile',
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

function FormOrderGuide({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="forms-guide-backdrop" role="presentation" onClick={onClose}>
      <div
        className="forms-guide-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="forms-guide-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="forms-guide-head">
          <span className="k-mark">Member instructions</span>
          <h2 id="forms-guide-title" className="k-display">
            Suggested form order
          </h2>
          <p className="k-narrative">
            Complete forms in this order so leadership has the information they need at the right time.
          </p>
        </header>

        <ol className="forms-guide-steps">
          <li>
            <strong>1. Player Profile</strong>
            <span>
              Update your Governor Gear, Charms, Pets, Masters, and Mystic Trial first. This keeps your
              power record current for every event.
            </span>
          </li>
          <li>
            <strong>2. KvK Prep Phase Backpack &amp; KvK Availability</strong>
            <span>
              If a Kingdom vs Kingdom event is upcoming, fill out the KvK Prep Phase Backpack form and the
              KvK Availability form next.
            </span>
          </li>
          <li>
            <strong>3. Flamedragon Tyrant &amp; Noble Advisor Schedule</strong>
            <span>
              If Flamedragon Tyrant is upcoming, complete the Flamedragon Tyrant form and the Noble Advisor
              Schedule form.
            </span>
          </li>
        </ol>

        <button type="button" className="forms-guide-close" onClick={onClose}>
          Got it — show the forms
        </button>
      </div>
    </div>
  );
}

export default function FormsDirectory({ memberId = '', closedKeys = [] }) {
  const encoded = encodeURIComponent(memberId || '');
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (!window.localStorage.getItem(GUIDE_STORAGE_KEY)) {
        setGuideOpen(true);
      }
    } catch {
      setGuideOpen(true);
    }
  }, []);

  function dismissGuide() {
    setGuideOpen(false);
    try {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    } catch {
      /* private mode */
    }
  }

  return (
    <section className="forms-catalog">
      <div className="forms-toolbar">
        <p className="forms-toolbar-copy k-narrative">
          Choose a form below. Prefer to review the recommended order again?
        </p>
        <button type="button" className="forms-guide-reopen" onClick={() => setGuideOpen(true)}>
          Form order guide
        </button>
      </div>

      <div className="forms-menu-grid" role="list">
        {FORMS.map((form) => {
          const isClosed = !form.ungated && closedKeys.includes(form.key);
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
              <span className="forms-menu-cta">
                {isClosed ? 'Unavailable' : 'Open form'} <b aria-hidden="true">→</b>
              </span>
            </Link>
          );
        })}
      </div>

      <FormOrderGuide open={guideOpen} onClose={dismissGuide} />

      <style>{`
        .forms-catalog{color:var(--parchment)}
        .forms-toolbar{
          display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;
          margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid rgba(201,164,78,.16);
        }
        .forms-toolbar-copy{margin:0;max-width:52ch;color:var(--parchment-dim);font-size:14px;line-height:1.5}
        .forms-guide-reopen{
          border:1px solid rgba(201,164,78,.35);background:rgba(201,164,78,.08);color:var(--gold-hot);
          font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
          padding:10px 14px;border-radius:8px;cursor:pointer;
        }
        .forms-guide-reopen:hover{border-color:rgba(201,164,78,.7);background:rgba(201,164,78,.14)}

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
        .forms-menu-cta{
          margin-top:auto;padding-top:10px;font-family:var(--font-mono);font-size:11px;font-weight:700;
          letter-spacing:.06em;text-transform:uppercase;color:var(--gold-hot);display:inline-flex;align-items:center;gap:6px;
        }
        .forms-menu-cta b{font-family:var(--font-body);font-weight:400;font-size:14px;transition:transform .18s var(--ease-cine,ease)}
        .forms-menu-tile:hover .forms-menu-cta b{transform:translateX(3px)}

        .forms-guide-backdrop{
          position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:24px;
          background:rgba(5,7,12,.72);backdrop-filter:blur(6px);
        }
        .forms-guide-panel{
          width:min(560px,100%);border-radius:16px;border:1px solid rgba(201,164,78,.28);
          background:linear-gradient(165deg,rgba(27,36,46,.98),rgba(12,15,22,.99));
          box-shadow:0 30px 80px rgba(0,0,0,.45);padding:28px 26px 24px;color:var(--parchment);
        }
        .forms-guide-head{margin-bottom:18px}
        .forms-guide-head h2{margin:8px 0 10px;font-size:clamp(1.35rem,3vw,1.7rem);color:#f6eedc}
        .forms-guide-head p{margin:0;color:var(--parchment-dim);line-height:1.55}
        .forms-guide-steps{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:14px}
        .forms-guide-steps li{
          display:grid;gap:6px;padding:14px 14px;border-radius:12px;
          border:1px solid rgba(201,164,78,.16);background:rgba(255,255,255,.03);
        }
        .forms-guide-steps strong{color:#f3e7c8;font-size:.95rem}
        .forms-guide-steps span{color:var(--parchment-dim);font-size:.9rem;line-height:1.5}
        .forms-guide-close{
          width:100%;min-height:46px;border:0;border-radius:10px;cursor:pointer;
          background:linear-gradient(135deg,#d4b56d,#a8873f);color:#1a1408;
          font-weight:700;letter-spacing:.04em;
        }
        .forms-guide-close:hover{filter:brightness(1.05)}

        @media(max-width:700px){
          .forms-menu-grid{grid-template-columns:1fr}
          .forms-toolbar{align-items:stretch}
          .forms-guide-reopen{width:100%}
        }
      `}</style>
    </section>
  );
}
