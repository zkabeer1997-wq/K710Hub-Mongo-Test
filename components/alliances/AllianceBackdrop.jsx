import './alliances.css';

/**
 * Decorative backdrop behind the alliance pages: a huge outlined tag watermark, a mountain silhouette and an
 * ember glow, all in the alliance's own band colour (the nearest .k-wb ancestor sets --wb / --wb-deep).
 * Pure CSS, no images, aria-hidden, never receives pointer events and is clipped to its own box (it is a
 * sibling of the content, not an ancestor, so sticky rails keep working). Static: nothing animates.
 */
export default function AllianceBackdrop({ tag }) {
  const label = String(tag || '');
  return (
    <div className="al-backdrop" aria-hidden="true">
      <span className="al-bd-glow" />
      <span className="al-bd-ridge al-bd-ridge-back" />
      <span className="al-bd-ridge al-bd-ridge-front" />
      <span className="al-watermark" style={{ '--len': Math.max(label.length, 3) }}>{label}</span>
    </div>
  );
}
