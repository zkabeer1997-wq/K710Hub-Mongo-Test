'use client';

import Link from 'next/link';

const destinations = [
  {
    key: 'tools',
    kicker: 'Planning',
    title: 'Tools & Calculators',
    description: 'Event planning, upgrade optimization, and kingdom utilities.',
    href: (id) => `/tools?member_id=${id}`,
  },
  {
    key: 'forms',
    kicker: 'Member information',
    title: 'Forms',
    description: 'Gear Tracking, KvK Availability, KvK Prep, and Flamedragon Tyrant.',
    href: (id) => `/forms?member_id=${id}`,
  },
  {
    key: 'admin',
    kicker: 'Administrators only',
    title: 'Admin Portal',
    description: 'Kingdom administration and response management.',
    href: () => '/admin',
  },
  {
    key: 'guides',
    kicker: 'Help and strategy',
    title: 'Guides',
    description: 'Strategy, event, and kingdom reference guides.',
    href: (id) => `/guides?member_id=${id}`,
  },
  {
    key: 'events',
    kicker: 'Schedule',
    title: 'Events',
    description: 'Bear Hunt windows, KvK, Championship, and Swordland, in your local time.',
    href: (id) => `/events?member_id=${id}`,
  },
];

function KingdomCrest() {
  return (
    <svg className="muster-crest" viewBox="0 0 120 140" aria-hidden="true">
      <defs>
        <linearGradient id="hubCrestStone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4b4638" />
          <stop offset="100%" stopColor="#191713" />
        </linearGradient>
      </defs>
      <path d="M60 6 L110 22 V70 C110 100 88 122 60 134 C32 122 10 100 10 70 V22 Z" fill="url(#hubCrestStone)" stroke="#8a6a28" strokeWidth="3" />
      <path d="M60 16 L100 29 V70 C100 95 82 113 60 124 C38 113 20 95 20 70 V29 Z" fill="none" stroke="rgba(201,164,78,0.42)" strokeWidth="1.4" />
      <path d="M60 44 L74 52 V70 L60 82 L46 70 V52 Z" fill="#c9a44e" opacity="0.55" />
      <path d="M60 54 L67 58 V68 L60 74 L53 68 V58 Z" fill="#1c1710" />
    </svg>
  );
}

function StationSigil({ type }) {
  if (type === 'tools') {
    return (
      <svg className="station-sigil station-sigil-tools" viewBox="0 0 96 96" aria-hidden="true">
        <g className="sigil-compass" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="62" cy="29" r="6" />
          <path d="M59 35 L44 70" />
          <path d="M65 35 L79 70" />
          <path d="M51 55 H72" strokeWidth="4" />
        </g>
        <g className="sigil-hammer" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 72 L53 40" />
          <path d="M38 24 L57 43" />
          <path d="M31 23 L41 16 L64 39 L56 48 Z" />
        </g>
      </svg>
    );
  }

  if (type === 'forms') {
    return (
      <svg className="station-sigil station-sigil-forms" viewBox="0 0 96 96" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M29 18 H67 V67 C67 75 61 80 53 80 H29 Z" strokeWidth="5" />
          <path d="M29 18 C22 18 19 22 19 28 C19 34 23 38 29 38" strokeWidth="5" />
          <path d="M39 34 H58 M39 45 H58 M39 56 H52" strokeWidth="4" />
          <circle className="sigil-seal" cx="66" cy="68" r="12" strokeWidth="4" />
          <path className="sigil-seal" d="M62 68 L65 71 L71 64" strokeWidth="3.5" />
        </g>
      </svg>
    );
  }

  if (type === 'admin') {
    return (
      <svg className="station-sigil station-sigil-admin" viewBox="0 0 96 96" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M48 14 L76 24 V47 C76 66 64 78 48 84 C32 78 20 66 20 47 V24 Z" strokeWidth="5" />
          <path className="sigil-crown" d="M31 43 L35 29 L46 38 L55 27 L64 43 Z" strokeWidth="4.5" />
          <path d="M34 51 H62" strokeWidth="4" />
          <path d="M42 61 H54 V70 H42 Z" strokeWidth="4" />
        </g>
      </svg>
    );
  }

  if (type === 'events') {
    return (
      <svg className="station-sigil station-sigil-events" viewBox="0 0 96 96" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <rect x="20" y="24" width="56" height="52" rx="4" strokeWidth="5" />
          <path d="M20 38 H76" strokeWidth="5" />
          <path d="M32 16 V30 M64 16 V30" strokeWidth="5" />
          <circle className="sigil-mark" cx="35" cy="52" r="4.5" fill="currentColor" stroke="none" />
          <circle className="sigil-mark" cx="52" cy="52" r="4.5" fill="currentColor" stroke="none" />
          <circle className="sigil-mark" cx="35" cy="65" r="4.5" fill="currentColor" stroke="none" />
        </g>
      </svg>
    );
  }

  return (
    <svg className="station-sigil station-sigil-guides" viewBox="0 0 96 96" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 24 C29 20 39 22 48 29 V76 C39 69 29 67 20 71 Z" strokeWidth="4.5" />
        <path d="M76 24 C67 20 57 22 48 29 V76 C57 69 67 67 76 71 Z" strokeWidth="4.5" />
        <path className="sigil-page" d="M29 36 C34 35 39 37 43 40 M29 47 C34 46 39 48 43 51 M67 36 C62 35 57 37 53 40 M67 47 C62 46 57 48 53 51" strokeWidth="3.2" />
        <path d="M48 29 V76" strokeWidth="3" />
        <path className="sigil-page" d="M45 16 L48 10 L51 16 M39 19 L35 14 M57 19 L61 14" strokeWidth="3.2" />
      </g>
    </svg>
  );
}

export default function MemberHub({ memberId }) {
  const encoded = encodeURIComponent(memberId || '');

  return (
    <main className="k-scene muster member-chambers">
      <div className="k-scene-layer muster-wall" aria-hidden="true" />
      <span className="muster-pillar muster-pillar-l" aria-hidden="true" />
      <span className="muster-pillar muster-pillar-r" aria-hidden="true" />
      <KingdomCrest />
      <span className="muster-banner muster-banner-l" data-band="RED" aria-hidden="true" />
      <span className="muster-banner muster-banner-r" data-band="SKY" aria-hidden="true" />
      <div className="muster-floor" aria-hidden="true" />
      <span className="muster-brazier muster-brazier-l" aria-hidden="true"><span className="muster-foot" /><span className="muster-flame" /></span>
      <span className="muster-brazier muster-brazier-r" aria-hidden="true"><span className="muster-foot" /><span className="muster-flame" /></span>
      <div className="k-scene-layer k-vignette" aria-hidden="true" />

      <div className="muster-inner member-chambers-inner">
        <header className="muster-head member-chambers-head">
          <span className="k-mark">Member {memberId}</span>
          <h1 className="k-display member-chambers-title">Member page</h1>
          <p className="k-narrative member-chambers-lede">Choose the section you want to open.</p>
        </header>

        <nav className="hall member-hall" aria-label="Member destinations">
          {destinations.map((item, index) => (
            <Link
              key={item.key}
              href={item.href(encoded)}
              className={`hall-station member-station member-station-${item.key}`}
              style={{ '--depth': index === 0 || index === 3 ? 0.9 : 1 }}
            >
              <span className="hall-object member-relic-wrap">
                <span className="member-relic" aria-hidden="true">
                  <span className="member-relic-top" />
                  <span className="member-relic-face">
                    <span className="member-sigil-medallion">
                      <StationSigil type={item.key} />
                    </span>
                  </span>
                  <span className="member-relic-base" />
                </span>
                <span className="hall-shadow" aria-hidden="true" />
              </span>
              <span className="hall-plaque member-plaque">
                <span className="k-mark hall-kicker">{item.kicker}</span>
                <span className="k-display hall-title">{item.title}</span>
                <span className="k-narrative hall-line">{item.description}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <style jsx>{`
        .member-chambers-inner{padding-top:clamp(142px,19vh,218px)}
        .member-chambers-head{margin-bottom:clamp(22px,4vh,44px)}
        .member-chambers-title{margin:10px 0 0;font-size:clamp(22px,3vw,38px);letter-spacing:.12em;color:var(--parchment)}
        .member-chambers-lede{max-width:52ch;margin:12px auto 0;color:var(--parchment-dim);font-size:clamp(15px,1.4vw,18px);font-style:italic}
        .member-hall{margin-top:auto}
        .member-relic-wrap{height:clamp(170px,20vw,250px);display:flex;align-items:flex-end;justify-content:center}
        .member-relic{position:relative;width:min(72%,190px);height:82%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;filter:drop-shadow(0 12px 8px rgba(0,0,0,.58));transition:filter var(--t-ui) ease,transform var(--t-ui) var(--ease-cine)}
        .member-relic-top{width:76%;height:13px;background:linear-gradient(180deg,#8e826b,#38332b);border:1px solid rgba(201,164,78,.28);border-radius:2px 2px 0 0}
        .member-relic-face{width:68%;flex:1;min-height:106px;display:grid;place-items:center;background:linear-gradient(90deg,#292822,#565145 48%,#24231f);border-inline:1px solid rgba(201,164,78,.24);position:relative}
        .member-relic-face:after{content:'';position:absolute;inset:11% 11%;border:1px solid rgba(201,164,78,.2);clip-path:polygon(50% 0,94% 18%,88% 72%,50% 100%,12% 72%,6% 18%)}
        .member-sigil-medallion{position:relative;z-index:1;width:84px;height:84px;display:grid;place-items:center;color:#d9b65b;filter:drop-shadow(0 2px 5px rgba(0,0,0,.72));transition:color var(--t-ui) ease,filter var(--t-ui) ease,transform var(--t-ui) var(--ease-cine)}
        .station-sigil{width:78px;height:78px;overflow:visible}
        .member-relic-base{width:90%;height:18px;background:linear-gradient(180deg,#5a5242,#25231e);border-top:1px solid rgba(201,164,78,.3);border-radius:2px}
        .member-station:hover .member-relic,.member-station:focus-visible .member-relic{filter:drop-shadow(0 15px 10px rgba(0,0,0,.62)) drop-shadow(0 0 9px rgba(201,164,78,.2));transform:translateY(-3px)}
        .member-station:hover .member-sigil-medallion,.member-station:focus-visible .member-sigil-medallion{color:#f0cf79;filter:drop-shadow(0 2px 5px rgba(0,0,0,.72)) drop-shadow(0 0 7px rgba(230,185,83,.28));transform:scale(1.045)}
        .member-station-tools .member-relic-face{background:linear-gradient(90deg,#242b2e,#4c5a59 48%,#202729)}
        .member-station-tools .member-sigil-medallion{color:#c7b063}
        .member-station-tools:hover :global(.sigil-hammer),.member-station-tools:focus-visible :global(.sigil-hammer){transform:rotate(-4deg);transform-origin:48px 44px}
        .member-station-forms .member-relic-face{background:linear-gradient(90deg,#30281c,#695537 48%,#2b2419)}
        .member-station-forms .member-sigil-medallion{color:#e0bc68}
        .member-station-forms:hover :global(.sigil-seal),.member-station-forms:focus-visible :global(.sigil-seal){filter:drop-shadow(0 0 4px rgba(239,193,92,.5))}
        .member-station-admin .member-relic-face{background:linear-gradient(90deg,#242532,#4d5064 48%,#20212b)}
        .member-station-admin .member-sigil-medallion{color:#c8b569}
        .member-station-admin:hover :global(.sigil-crown),.member-station-admin:focus-visible :global(.sigil-crown){filter:drop-shadow(0 0 5px rgba(239,205,112,.45))}
        .member-station-guides .member-relic-face{background:linear-gradient(90deg,#2b2419,#665337 48%,#241e16)}
        .member-station-guides .member-sigil-medallion{color:#d6b86f}
        .member-station-guides:hover :global(.sigil-page),.member-station-guides:focus-visible :global(.sigil-page){filter:drop-shadow(0 0 5px rgba(242,203,112,.5));transform:translateY(-1px)}
        .member-station-events .member-relic-face{background:linear-gradient(90deg,#242c30,#4c6266 48%,#1f2729)}
        .member-station-events .member-sigil-medallion{color:#b9d2c9}
        .member-station-events:hover :global(.sigil-mark),.member-station-events:focus-visible :global(.sigil-mark){filter:drop-shadow(0 0 4px rgba(185,210,201,.55))}
        :global(.sigil-hammer),:global(.sigil-seal),:global(.sigil-crown),:global(.sigil-page),:global(.sigil-mark){transition:transform var(--t-ui) var(--ease-cine),filter var(--t-ui) ease,color var(--t-ui) ease}
        .member-plaque{margin-top:10px}
        @media(max-width:1000px){.member-chambers-inner{padding-top:112px}.member-relic-wrap{height:210px}.member-hall{row-gap:22px}.member-chambers-head{margin-bottom:20px}}
        @media(max-width:560px){.member-chambers-inner{padding-top:92px}.member-chambers-title{font-size:22px}.member-chambers-lede{font-size:15px}.member-relic-wrap{height:170px}.member-relic{width:150px}.member-sigil-medallion{width:72px;height:72px}.station-sigil{width:68px;height:68px}}
        @media(prefers-reduced-motion:reduce){.member-relic,.member-sigil-medallion,:global(.sigil-hammer),:global(.sigil-seal),:global(.sigil-crown),:global(.sigil-page){transition:none!important;transform:none!important}}
      `}</style>
    </main>
  );
}
