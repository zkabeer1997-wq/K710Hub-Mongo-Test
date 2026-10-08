import { TroopIcon, StarGlyph } from './LoadoutIcons';
import LoadoutArt from './LoadoutArt';
import { gearAriaLabel, gearCaption, gearImageFor, parseGearValue } from '../../lib/loadout.mjs';
import { QUALITIES } from '../../lib/scan/kinds/governorProfile/gameData.mjs';

const NAME = new Map(QUALITIES.map((q) => [q.id, q.name]));

/**
 * One Governor Gear tile. With owner art (hat, shirt, ring) the picture already contains the tier label and stars, so only a
 * caption strip is added; without art (pendant, pants, baton) or if the image fails, the drawn tile is used.
 * Quality colour is a DISPLAY choice (see loadout.css), and the quality name is always printed as text.
 */
export default function GearSlotButton({ piece, value, active, open, onActivate }) {
  const parsed = parseGearValue(value);
  const raw = String(value || '').trim();
  const filled = Boolean(raw);
  const quality = parsed?.quality || (filled ? 'other' : 'none');
  const src = gearImageFor(piece.gearKey, value);
  const label = gearAriaLabel(piece, value);
  const drawn = (
    <>
      <TroopIcon troop={piece.troop} className="lo-tile-icon" />
      {parsed?.tier ? <span className="lo-tile-tier" aria-hidden="true">T{parsed.tier}</span> : null}
      <span className="lo-tile-text" aria-hidden="true">
        {parsed ? NAME.get(parsed.quality) : filled ? raw : 'No gear'}
      </span>
    </>
  );
  return (
    <div className="lo-gear" data-art={src ? 'true' : undefined}>
      <span className="lo-stars" aria-hidden="true">
        {parsed && !src ? Array.from({ length: parsed.stars }, (_, i) => <StarGlyph key={i} className="lo-star" />) : null}
      </span>
      <div className="lo-gear-main">
      <button
        type="button"
        id={`lo-tile-${piece.id}`}
        className="lo-tile"
        data-quality={quality}
        data-art={src ? 'true' : undefined}
        data-active={active ? 'true' : undefined}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={label}
        onClick={() => onActivate(piece.id, 'gear')}
        onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }} // keep the form's Enter guard from swallowing button activation
      >
        <LoadoutArt src={src} alt={label} className="lo-tile-art" fallback={drawn} />
      </button>
      <span className="lo-tile-caption" aria-hidden="true">{src ? gearCaption(value) : ''}</span>
      </div>
    </div>
  );
}
