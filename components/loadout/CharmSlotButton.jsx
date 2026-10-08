import { CharmGem } from './LoadoutIcons';
import { charmAriaLabel } from '../../lib/loadout.mjs';

export default function CharmSlotButton({ piece, index, value, active, onActivate }) {
  const level = String(value || '').replace(/^Level\s*/, '').trim();
  return (
    <button
      type="button"
      className="lo-charm"
      data-filled={level ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
      aria-label={charmAriaLabel(piece, index, value)}
      onClick={() => onActivate(piece.id, index)}
    >
      <CharmGem level={level} />
    </button>
  );
}
