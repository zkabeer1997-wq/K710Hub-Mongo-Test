import { CharmGem } from './LoadoutIcons';
import LoadoutArt from './LoadoutArt';
import { charmAriaLabel, charmImageFor } from '../../lib/loadout.mjs';

export default function CharmSlotButton({ piece, index, value, active, open, onActivate }) {
  const level = String(value || '').replace(/^Level\s*/, '').trim();
  const src = charmImageFor(piece.troop, level);
  return (
    <button
      type="button"
      id={`lo-gem-${piece.id}-${index}`}
      className="lo-charm"
      aria-haspopup="dialog"
      aria-expanded={open ? 'true' : 'false'}
      data-filled={level ? 'true' : undefined}
      data-art={src ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
      aria-label={charmAriaLabel(piece, index, value)}
      onClick={() => onActivate(piece.id, index)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }} // keep the form's Enter guard from swallowing button activation
    >
      <LoadoutArt src={src} alt="" className="lo-gem-art" fallback={<CharmGem level={level} />}>
        <span className="lo-gem-badge" aria-hidden="true">{level}</span>
      </LoadoutArt>
    </button>
  );
}
