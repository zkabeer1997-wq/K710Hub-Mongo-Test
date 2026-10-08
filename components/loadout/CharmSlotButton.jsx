import { CharmGem } from './LoadoutIcons';
import { charmAriaLabel } from '../../lib/loadout.mjs';

export default function CharmSlotButton({ piece, index, value, active, open, onActivate }) {
  const level = String(value || '').replace(/^Level\s*/, '').trim();
  return (
    <button
      type="button"
      id={`lo-gem-${piece.id}-${index}`}
      className="lo-charm"
      aria-haspopup="dialog"
      aria-expanded={open ? 'true' : 'false'}
      data-filled={level ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
      aria-label={charmAriaLabel(piece, index, value)}
      onClick={() => onActivate(piece.id, index)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }} // keep the form's Enter guard from swallowing button activation
    >
      <CharmGem level={level} />
    </button>
  );
}
