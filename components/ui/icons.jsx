// Small inline-SVG icon set (stroke icons, currentColor). Used by the tool
// directory today; any page can import it. No icon package on purpose.
const PATHS = {
  // helmet / armour: governor + hero gear
  gear: (
    <>
      <path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-3Z" />
      <path d="M12 8v6M9 11h6" />
    </>
  ),
  // faceted gem: charms
  charms: (
    <>
      <path d="M6.5 4h11L21 9.5 12 21 3 9.5 6.5 4Z" />
      <path d="M3 9.5h18M9.5 4 8 9.5 12 21l4-11.5L14.5 4" />
    </>
  ),
  // paw: pets
  pets: (
    <>
      <ellipse cx="12" cy="16.2" rx="4.6" ry="3.6" />
      <circle cx="5.6" cy="11.2" r="1.9" />
      <circle cx="9.3" cy="6.6" r="1.9" />
      <circle cx="14.7" cy="6.6" r="1.9" />
      <circle cx="18.4" cy="11.2" r="1.9" />
    </>
  ),
  // crown: masters
  masters: (
    <>
      <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-1.8 10H4.8L3 8Z" />
      <path d="M5 21h14" />
    </>
  ),
  // house + hammer-ish roofline: construction
  construction: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 10v10h13V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  // flask: research
  research: (
    <>
      <path d="M9.5 3h5M10.5 3v6.2L5 19a1.4 1.4 0 0 0 1.2 2.1h11.6A1.4 1.4 0 0 0 19 19l-5.5-9.8V3" />
      <path d="M7.8 15h8.4" />
    </>
  ),
  // shopping bag: event shops
  shop: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  // route with waypoints: roadmap / planning
  roadmap: (
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" />
    </>
  ),
  // sailing ship: sailing optimizers
  sail: (
    <>
      <path d="M12 3v13M12 4c4 2 6 6 6 11h-6M12 6c-3 1.6-5 4.4-5 9h5" />
      <path d="M4 19c2.5 2 5 2 8 0 3 2 5.5 2 8 0" />
    </>
  ),
  // --- member action center ---
  shield: (
    <>
      <path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-3Z" />
      <circle cx="12" cy="11" r="2.6" />
    </>
  ),
  sword: (
    <>
      <path d="m14.5 4.5 5-1-1 5-9 9-4-4 9-9Z" />
      <path d="m5.5 14.5-2.5 2.5M7 19l-2 2M9.5 16.5 7 19" />
    </>
  ),
  castle: (
    <>
      <path d="M4 21V8h3v2h2V8h2v2h2V8h2v2h2V8h1v13H4Z" />
      <path d="M10 21v-5a2 2 0 0 1 4 0v5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  backpack: (
    <>
      <path d="M8 6a4 4 0 0 1 8 0" />
      <rect x="5" y="6" width="14" height="15" rx="3" />
      <path d="M9 14h6M9 11h6" />
    </>
  ),
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.5 1 2 2 2-.5-3 0-5 1-8Z" />,
  crown: (
    <>
      <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-1.8 10H4.8L3 8Z" />
      <path d="M5 21h14" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4M12 17.2v.1" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
};

export const ICON_NAMES = Object.keys(PATHS);

export default function Icon({ name, size = 28, strokeWidth = 1.6, className = '', title }) {
  const body = PATHS[name] || PATHS.gear;
  return (
    <svg
      className={`ui-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      {body}
    </svg>
  );
}
