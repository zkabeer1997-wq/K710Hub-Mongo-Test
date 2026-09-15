'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * THE MUSTER HALL
 *
 * The member hub, built as a preparation hall rather than a row of
 * cards. Each destination is a physical station drawn in SVG — a
 * command table, a muster board, a campaign backpack, an armory rack —
 * that lights on hover/focus and carries its own label.
 *
 * Every station is a real <Link>, so keyboard and screen-reader users
 * get identical navigation to the pointer path.
 */

function CommandTable({ lit }) {
  return (
    <svg viewBox="0 0 200 150" className="station-art" aria-hidden="true" data-lit={lit}>
      <defs>
        <radialGradient id="tableGlow">
          <stop offset="0%" stopColor="#ffcb7a" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffcb7a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tableTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6a5230" />
          <stop offset="100%" stopColor="#3a2c18" />
        </linearGradient>
      </defs>

      {/* legs, splayed so the table has volume */}
      <path d="M56 96 L44 138" stroke="#3a2d18" strokeWidth="7" strokeLinecap="round" />
      <path d="M144 96 L156 138" stroke="#3a2d18" strokeWidth="7" strokeLinecap="round" />
      <path d="M100 104 L100 140" stroke="#2e2313" strokeWidth="8" strokeLinecap="round" />

      {/* table edge, then the surface set into it */}
      <ellipse cx="100" cy="98" rx="82" ry="30" fill="#241b0f" />
      <ellipse cx="100" cy="94" rx="82" ry="30" fill="url(#tableTop)" stroke="#8a6a28" strokeWidth="2.2" />
      <ellipse cx="100" cy="94" rx="70" ry="23" fill="#5c4726" />

      {/* the map: coastline, road, river */}
      <path d="M42 96 q24 -13 50 -4 t62 -8" stroke="#c9a44e" strokeWidth="1.5" fill="none" opacity="0.8" />
      <path d="M56 104 q26 -9 48 -3 t44 -6" stroke="#a8834a" strokeWidth="1.1" fill="none" opacity="0.55" />
      <path d="M74 86 q14 8 34 6 t32 -8" stroke="#7d6a44" strokeWidth="1" fill="none" opacity="0.5" />

      {/* standing markers: a pin and a pennant for each alliance */}
      <g className="station-glint" fill="#d9a94e">
        <path d="M74 88 l0 -20 l12 5 l-12 5 Z" />
        <circle cx="74" cy="89" r="3.4" />
      </g>
      <g className="station-glint" fill="#a3283c">
        <path d="M106 92 l0 -17 l11 4 l-11 4 Z" />
        <circle cx="106" cy="93" r="3.4" />
      </g>
      <g className="station-glint" fill="#3f74bd">
        <path d="M132 85 l0 -15 l10 4 l-10 4 Z" />
        <circle cx="132" cy="86" r="3.2" />
      </g>

      {/* candle at the table edge — the light source for the pool below */}
      <rect x="156" y="76" width="7" height="16" rx="2" fill="#d8c69c" />
      <ellipse cx="159.5" cy="92" rx="7" ry="3" fill="#4a3a20" />
      <ellipse cx="159.5" cy="72" rx="3" ry="5" fill="#ffd489" className="station-glint" />

      <ellipse cx="100" cy="94" rx="76" ry="26" fill="url(#tableGlow)" className="station-pool" />
    </svg>
  );
}

function MusterBoard({ lit }) {
  return (
    <svg viewBox="0 0 200 150" className="station-art" aria-hidden="true" data-lit={lit}>
      <defs>
        <radialGradient id="boardGlow">
          <stop offset="0%" stopColor="#ffcb7a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffcb7a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* posts */}
      <rect x="46" y="96" width="9" height="44" rx="2" fill="#3a2d18" />
      <rect x="145" y="96" width="9" height="44" rx="2" fill="#3a2d18" />

      {/* peaked roof over the board, so weather does not take the notices */}
      <path d="M34 32 L100 12 L166 32 L160 38 L100 20 L40 38 Z" fill="#4a3a20" stroke="#6b5024" strokeWidth="1.6" />

      {/* board face */}
      <rect x="42" y="36" width="116" height="66" rx="2" fill="#2b2114" stroke="#6b5024" strokeWidth="2" />
      <rect x="46" y="40" width="108" height="58" fill="#3a2c18" />

      {/* pinned parchment slips, each sealed in an alliance colour */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={52} y={45 + i * 18} width="66" height="14" rx="1" fill="#d8c69c" opacity="0.88" />
          <rect x={56} y={49 + i * 18} width="42" height="1.8" fill="#6b5b3c" opacity="0.7" />
          <rect x={56} y={53 + i * 18} width="30" height="1.8" fill="#6b5b3c" opacity="0.55" />
          <circle
            cx="126"
            cy={52 + i * 18}
            r="6"
            className="station-glint"
            fill={['#d9a94e', '#a3283c', '#3f74bd'][i]}
          />
        </g>
      ))}

      {/* two shields leaning against the posts */}
      <path d="M24 88 L38 92 V104 C38 112 32 118 31 119 C30 118 24 112 24 104 Z" fill="#2f3650" stroke="#6b5024" strokeWidth="1.6" />
      <path d="M162 88 L176 92 V104 C176 112 170 118 169 119 C168 118 162 112 162 104 Z" fill="#2f3650" stroke="#6b5024" strokeWidth="1.6" />

      <ellipse cx="100" cy="112" rx="72" ry="18" fill="url(#boardGlow)" className="station-pool" />
    </svg>
  );
}

function CampaignBackpack({ lit }) {
  return (
    <svg viewBox="0 0 200 150" className="station-art" aria-hidden="true" data-lit={lit}>
      <defs>
        <radialGradient id="packGlow">
          <stop offset="0%" stopColor="#ffcb7a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffcb7a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* bedroll lashed across the top */}
      <rect x="60" y="36" width="80" height="16" rx="8" fill="#6b5b3c" stroke="#8a6a28" strokeWidth="1.4" />
      <ellipse cx="60" cy="44" rx="5" ry="8" fill="#5a4c31" />
      <ellipse cx="140" cy="44" rx="5" ry="8" fill="#7a6844" />

      {/* pack body */}
      <path d="M66 54 q34 -12 68 0 l7 68 q-41 11 -82 0 Z" fill="#4a3320" stroke="#7d5a2c" strokeWidth="2" />
      {/* flap with a buckle */}
      <path d="M66 54 q34 -12 68 0 l3 24 q-37 10 -74 0 Z" fill="#5f4227" stroke="#7d5a2c" strokeWidth="1.6" />
      <rect x="93" y="72" width="14" height="12" rx="2" fill="#2f2114" />
      <rect x="95" y="74" width="10" height="8" rx="1.5" fill="#c9a44e" className="station-glint" />
      {/* side straps */}
      <path d="M72 92 q30 7 58 0" stroke="#2f2114" strokeWidth="4" fill="none" />
      <path d="M74 106 q29 7 55 0" stroke="#2f2114" strokeWidth="4" fill="none" />

      {/* scroll case leaning on the pack */}
      <rect x="30" y="82" width="14" height="40" rx="7" fill="#3a2c18" stroke="#7d5a2c" strokeWidth="1.4" />
      <rect x="28" y="80" width="18" height="7" rx="3.5" fill="#8a6a28" />

      {/* canteen hanging off the side */}
      <circle cx="160" cy="104" r="13" fill="#3a2c18" stroke="#7d5a2c" strokeWidth="1.6" />
      <rect x="156" y="88" width="8" height="6" rx="2" fill="#8a6a28" />
      <path d="M141 92 q12 -6 19 -2" stroke="#5c4026" strokeWidth="2.4" fill="none" />

      <ellipse cx="100" cy="124" rx="74" ry="17" fill="url(#packGlow)" className="station-pool" />
    </svg>
  );
}

function ArmoryRack({ lit }) {
  return (
    <svg viewBox="0 0 200 150" className="station-art" aria-hidden="true" data-lit={lit}>
      <defs>
        <radialGradient id="armGlow">
          <stop offset="0%" stopColor="#ffcb7a" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#ffcb7a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="shieldFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4b5578" />
          <stop offset="100%" stopColor="#252b40" />
        </linearGradient>
      </defs>

      {/* rack frame */}
      <rect x="34" y="26" width="132" height="9" rx="2" fill="#4a3a20" />
      <rect x="38" y="112" width="124" height="9" rx="2" fill="#4a3a20" />
      <rect x="40" y="30" width="7" height="86" fill="#3a2d18" />
      <rect x="153" y="30" width="7" height="86" fill="#3a2d18" />

      {/* spear and axe leaning in the rack */}
      <rect x="58" y="34" width="5" height="80" fill="#6b5b3c" />
      <path d="M54 34 l6.5 -16 l6.5 16 Z" fill="#a8b3d6" />
      <rect x="137" y="34" width="5" height="80" fill="#6b5b3c" />
      <path d="M133 26 q14 -6 18 6 q-12 7 -18 0 Z" fill="#a8b3d6" />

      {/* the shield, hung centre — a heater, not a disc */}
      <path
        d="M100 34 L136 46 V78 C136 100 116 114 100 120 C84 114 64 100 64 78 V46 Z"
        fill="url(#shieldFace)"
        stroke="#8a6a28"
        strokeWidth="2.4"
      />
      <path d="M100 44 L127 53 V78 C127 94 112 105 100 110 C88 105 73 94 73 78 V53 Z" fill="none" stroke="rgba(201,164,78,0.4)" strokeWidth="1.2" />
      <path d="M100 62 L112 69 V83 L100 92 L88 83 V69 Z" fill="#c9a44e" className="station-glint" />

      <ellipse cx="100" cy="122" rx="70" ry="16" fill="url(#armGlow)" className="station-pool" />
    </svg>
  );
}

function ScrollDesk({ lit }) {
  return (
    <svg viewBox="0 0 200 150" className="station-art" aria-hidden="true" data-lit={lit}>
      <defs>
        <radialGradient id="deskGlow">
          <stop offset="0%" stopColor="#ffcb7a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffcb7a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="deskTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6a5230" />
          <stop offset="100%" stopColor="#3a2c18" />
        </linearGradient>
      </defs>

      {/* desk legs */}
      <path d="M52 100 L48 138" stroke="#3a2d18" strokeWidth="7" strokeLinecap="round" />
      <path d="M148 100 L152 138" stroke="#3a2d18" strokeWidth="7" strokeLinecap="round" />

      {/* desk top, angled like a lectern */}
      <path d="M40 100 L160 100 L146 76 L54 76 Z" fill="url(#deskTop)" stroke="#8a6a28" strokeWidth="2" />
      <rect x="46" y="98" width="108" height="8" rx="2" fill="#2b2114" />

      {/* open ledger with a quill resting across it */}
      <path d="M66 96 L98 92 L98 78 L66 82 Z" fill="#e6d6a8" opacity="0.92" />
      <path d="M98 92 L132 96 L132 82 L98 78 Z" fill="#d8c69c" opacity="0.92" />
      <path d="M72 86 q11 -2 22 -1" stroke="#6b5b3c" strokeWidth="1.4" fill="none" opacity="0.6" />
      <path d="M72 90 q11 -2 20 -1" stroke="#6b5b3c" strokeWidth="1.4" fill="none" opacity="0.5" />
      <path d="M104 87 q11 1 22 3" stroke="#6b5b3c" strokeWidth="1.4" fill="none" opacity="0.6" />

      {/* quill and inkwell */}
      <path d="M118 82 L150 52" stroke="#c9a44e" strokeWidth="2" strokeLinecap="round" className="station-glint" />
      <path d="M150 52 l8 -10 l-4 12 Z" fill="#c9a44e" className="station-glint" />
      <ellipse cx="144" cy="84" rx="8" ry="6" fill="#241b0f" stroke="#7d5a2c" strokeWidth="1.6" />
      <ellipse cx="144" cy="82" rx="5" ry="3" fill="#3a2c18" />

      {/* rolled petitions leaning at the desk edge */}
      <rect x="34" y="80" width="10" height="30" rx="5" fill="#3a2c18" stroke="#7d5a2c" strokeWidth="1.4" />
      <rect x="32" y="78" width="14" height="6" rx="3" fill="#8a6a28" />

      <ellipse cx="100" cy="104" rx="74" ry="18" fill="url(#deskGlow)" className="station-pool" />
    </svg>
  );
}

/* The kingdom mark cut into the back wall — stone relief, brass rim. */
function HallCrest() {
  return (
    <svg className="muster-crest" viewBox="0 0 120 140" aria-hidden="true">
      <defs>
        <linearGradient id="crestStone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4b4638" />
          <stop offset="100%" stopColor="#191713" />
        </linearGradient>
      </defs>
      <path
        d="M60 6 L110 22 V70 C110 100 88 122 60 134 C32 122 10 100 10 70 V22 Z"
        fill="url(#crestStone)"
        stroke="#8a6a28"
        strokeWidth="3"
      />
      <path
        d="M60 16 L100 29 V70 C100 95 82 113 60 124 C38 113 20 95 20 70 V29 Z"
        fill="none"
        stroke="rgba(201,164,78,0.42)"
        strokeWidth="1.4"
      />
      <path d="M60 44 L74 52 V70 L60 82 L46 70 V52 Z" fill="#c9a44e" opacity="0.55" />
      <path d="M60 54 L67 58 V68 L60 74 L53 68 V58 Z" fill="#1c1710" />
    </svg>
  );
}

// Each variant is a distinct room: the top-level hall, or one of its
// smaller sub-halls reached by clicking a category station there. Sharing
// one component keeps every hall's art, depth staging, and gating logic
// in one place instead of duplicating the room shell per page.
const VARIANTS = {
  top: {
    title: 'Choose a form',
    stations: [
      {
        key: 'lead',
        art: CommandTable,
        kicker: 'Account details',
        title: 'Gear Tracking',
        line: 'Record your gear, troops, and heroes.',
        href: (id) => `/power-profile?member_id=${id}`,
      },
      {
        key: 'kvk-hub',
        art: MusterBoard,
        kicker: 'KvK forms',
        title: 'KvK Forms',
        line: 'Availability and preparation, in one place.',
        href: (id) => `/forms/kvk?member_id=${id}`,
        // A category link, not a leaf form - it never carries its own
        // "Closed" state, only the forms behind it can be closed.
        ungated: true,
      },
      {
        key: 'dragon-hub',
        art: ArmoryRack,
        kicker: 'Event forms',
        title: 'Flamedragon Tyrant Forms',
        line: 'Levels, heroes, and availability for the event.',
        href: (id) => `/forms/flamedragon-tyrant?member_id=${id}`,
        ungated: true,
      },
      {
        key: 'requests',
        art: ScrollDesk,
        kicker: 'Feedback',
        title: 'Website Requests',
        line: 'Suggest an improvement to K710Hub.',
        href: (id) => `/forms/requests?member_id=${id}`,
      },
    ],
  },
  kvk: {
    title: 'KvK Forms',
    backHref: '/forms',
    backLabel: 'Back to Forms',
    stations: [
      {
        key: 'joiner',
        art: MusterBoard,
        kicker: 'KvK form',
        title: 'KvK Availability',
        line: 'Tell leadership when you are available.',
        href: (id) => `/player-record/form?member_id=${id}`,
      },
      {
        key: 'prep',
        art: CampaignBackpack,
        kicker: 'Preparation form',
        title: 'KvK Prep',
        line: 'Submit your KvK preparation items.',
        href: (id) => `/prep-phase-backpack?member_id=${id}`,
      },
    ],
  },
  'flamedragon-tyrant': {
    title: 'Flamedragon Tyrant Forms',
    backHref: '/forms',
    backLabel: 'Back to Forms',
    stations: [
      { key: 'noble', art: CampaignBackpack, kicker: 'Training appointments', title: 'Noble Advisor Schedule', line: 'Book a Troop Training appointment for Flamedragon.', href: () => '/forms/flamedragon-tyrant/noble-advisor' },
      {
        key: 'dragon',
        art: ArmoryRack,
        kicker: 'Event form',
        title: 'Flamedragon Tyrant',
        line: 'Submit levels, heroes, and availability.',
        href: (id) => `/flamedragon?member_id=${id}`,
      },
    ],
  },
};

// Outer stations stand further back - smaller, higher, dimmer - so a row
// reads as things in a room rather than cells in a grid. Symmetric around
// the middle regardless of how many stations a given hall has.
function depthsFor(count) {
  return Array.from({ length: count }, (_, i) => {
    const distanceFromEdge = Math.min(i, count - 1 - i);
    return distanceFromEdge === 0 ? 0.9 : 1;
  });
}

export default function MusterHall({ memberId, closedKeys = [], variant = 'top' }) {
  const [hot, setHot] = useState(null);
  const encoded = encodeURIComponent(memberId);
  const { title, stations, backHref, backLabel } = VARIANTS[variant] || VARIANTS.top;
  const depths = depthsFor(stations.length);

  return (
    <main className="k-scene muster">
      {/* room envelope: wall, pilasters, crest, standards, floor, braziers */}
      <div className="k-scene-layer muster-wall" aria-hidden="true" />
      <span className="muster-pillar muster-pillar-l" aria-hidden="true" />
      <span className="muster-pillar muster-pillar-r" aria-hidden="true" />
      <HallCrest />
      <span className="muster-banner muster-banner-l" data-band="RED" aria-hidden="true" />
      <span className="muster-banner muster-banner-r" data-band="SKY" aria-hidden="true" />
      <div className="muster-floor" aria-hidden="true" />
      <span className="muster-brazier muster-brazier-l" aria-hidden="true">
        <span className="muster-foot" />
        <span className="muster-flame" />
      </span>
      <span className="muster-brazier muster-brazier-r" aria-hidden="true">
        <span className="muster-foot" />
        <span className="muster-flame" />
      </span>
      <div className="k-scene-layer k-vignette" aria-hidden="true" />

      <div className="muster-inner">
        <header className="muster-head">
          {backHref && (
            <Link href={`${backHref}?member_id=${encoded}`} className="muster-back-link">
              &larr; {backLabel}
            </Link>
          )}
          <span className="k-mark">Member forms &middot; {memberId}</span>
          <h1 className="k-display muster-title">{title}</h1>
        </header>

        {/* Objects standing on a shared floor. Depth varies per station so
            they read as things in a room rather than cells in a grid. */}
        <nav className="hall" style={{ '--hall-count': stations.length }} aria-label="Muster hall stations">
          {stations.map((s, i) => {
            const Art = s.art;
            const isClosed = !s.ungated && closedKeys.includes(s.key);
            return (
              <Link
                key={s.key}
                href={s.href(encoded)}
                className="hall-station"
                style={{ '--depth': depths[i] }}
                data-hot={hot === s.key}
                data-closed={isClosed}
                onMouseEnter={() => setHot(s.key)}
                onMouseLeave={() => setHot((h) => (h === s.key ? null : h))}
                onFocus={() => setHot(s.key)}
                onBlur={() => setHot((h) => (h === s.key ? null : h))}
              >
                <span className="hall-object">
                  <Art lit={hot === s.key} />
                  <span className="hall-shadow" aria-hidden="true" />
                </span>
                <span className="hall-plaque">
                  <span className="k-mark hall-kicker">{s.kicker}</span>
                  <span className="k-display hall-title">{s.title}</span>
                  <span className="k-narrative hall-line">{isClosed ? 'Closed for now.' : s.line}</span>
                  {isClosed && <span className="hall-closed-tag">Closed</span>}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </main>
  );
}
