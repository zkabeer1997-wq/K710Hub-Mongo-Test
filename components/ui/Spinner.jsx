// Lightweight loading primitives shared across route skeletons (loading.js)
// and in-component async states. No hooks, so they render in both server and
// client components. Motion is CSS-only and honored/stopped by
// prefers-reduced-motion (see .ui-spinner / .ui-skel in primitives.css, plus
// the global reduced-motion rule in globals.css).

export function Spinner({ size = 20, label = 'Loading', className = '' }) {
  return (
    <span
      className={`ui-spinner ${className}`.trim()}
      role="status"
      aria-label={label}
      style={{ width: size, height: size }}
    >
      <span className="ui-spinner-ring" aria-hidden="true" />
    </span>
  );
}

// Spinner + message, for inline "fetching…" states inside forms and tools.
export function LoadingRow({ children = 'Loading…', size = 18, className = '' }) {
  return (
    <div className={`ui-loading-row ${className}`.trim()}>
      <Spinner size={size} label={typeof children === 'string' ? children : 'Loading'} />
      <span className="ui-loading-row-text">{children}</span>
    </div>
  );
}

// A single shimmer placeholder block. Width/height are inline so route
// skeletons can compose a rough page layout without bespoke CSS each time.
export function Skeleton({ width, height = 16, radius = 'var(--radius-sm)', className = '', style = {} }) {
  return (
    <span
      className={`ui-skel ${className}`.trim()}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}
