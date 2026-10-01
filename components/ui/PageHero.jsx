// The one public-page hero: eyebrow (Cinzel, small), H1 (Fraunces), lede,
// optional actions, optional aside (stat / emblem panel).
//
//   tone="realm"   - warm editorial band, full width (About, Events, Guides ...)
//   tone="console" - compact, dense header for tool/form pages
//
// `before` renders above the eyebrow (e.g. breadcrumbs).
// Place a realm hero as a direct child of <main> (outside any max-width
// wrapper): the band is full-bleed and .ph-inner holds the page max-width.
export default function PageHero({
  eyebrow,
  title,
  lede,
  actions,
  aside,
  before,
  tone = 'realm',
  titleId,
  className = '',
  children,
}) {
  return (
    <header className={`ph ph--${tone} ${aside ? 'ph--has-aside' : ''} ${className}`.trim()}>
      <div className="ph-inner">
        <div className="ph-copy">
          {before}
          {eyebrow && <p className="ph-eyebrow">{eyebrow}</p>}
          <h1 className="ph-title" id={titleId}>{title}</h1>
          {lede && <p className="ph-lede">{lede}</p>}
          {children}
          {actions && <div className="ph-actions">{actions}</div>}
        </div>
        {aside && <div className="ph-aside">{aside}</div>}
      </div>
    </header>
  );
}
