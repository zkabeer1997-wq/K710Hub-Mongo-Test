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
