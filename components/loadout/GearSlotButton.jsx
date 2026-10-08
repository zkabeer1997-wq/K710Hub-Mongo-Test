import { TroopIcon, StarGlyph } from './LoadoutIcons';
import { gearAriaLabel, parseGearValue } from '../../lib/loadout.mjs';
import { QUALITIES } from '../../lib/scan/kinds/governorProfile/gameData.mjs';

const NAME = new Map(QUALITIES.map((q) => [q.id, q.name]));

/** One Governor Gear tile. Quality colour is a DISPLAY choice (see loadout.css), and the quality name is always printed. */
export default function GearSlotButton({ piece, value, active, onActivate }) {
  const parsed = parseGearValue(value);
  const raw = String(value || '').trim();
  const filled = Boolean(raw);
  const quality = parsed?.quality || (filled ? 'other' : 'none');
  return (
    <div className="lo-gear">
      <span className="lo-stars" aria-hidden="true">
        {parsed ? Array.from({ length: parsed.stars }, (_, i) => <StarGlyph key={i} className="lo-star" />) : null}
      </span>
      <button
        type="button"
        id={`lo-tile-${piece.id}`}
        className="lo-tile"
        data-quality={quality}
        data-active={active ? 'true' : undefined}
        aria-label={gearAriaLabel(piece, value)}
        onClick={() => onActivate(piece.id, 'gear')}
      >
        <TroopIcon troop={piece.troop} className="lo-tile-icon" />
        {parsed?.tier ? <span className="lo-tile-tier" aria-hidden="true">T{parsed.tier}</span> : null}
        <span className="lo-tile-text" aria-hidden="true">
          {parsed ? NAME.get(parsed.quality) : filled ? raw : 'No gear'}
        </span>
      </button>
    </div>
  );
}
