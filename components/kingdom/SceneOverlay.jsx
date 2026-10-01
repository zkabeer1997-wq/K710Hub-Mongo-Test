'use client';

export default function SceneOverlay({ hoveredRoad, onHover, onSelect, phase }) {
  const disabled = phase === 'transitioning';

  return (
    <div className={`kingdom-overlay${disabled ? ' kingdom-overlay-locked' : ''}`}>
      <div className="kingdom-overlay-top">
        <span className="kingdom-eyebrow">Kingdom 710 &middot; Kingshot</span>
        <h1 className="kingdom-title">Choose your road</h1>
      </div>

      <div className="kingdom-roads">
        <button
          type="button"
          className="kingdom-road kingdom-road-gold"
          onMouseEnter={() => onHover('left')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('left')}
          onBlur={() => onHover(null)}
          onClick={() => onSelect('left', '/interest')}
          disabled={disabled}
          aria-label="Request Entry — petition for transfer into Kingdom 710"
          data-active={hoveredRoad === 'left'}
        >
          <span className="road-kicker">The Golden Road</span>
          <span className="road-title">Request Entry</span>
          <span className="road-sub">Petition for transfer into Kingdom 710</span>
        </button>

        <button
          type="button"
          className="kingdom-road kingdom-road-blue"
          onMouseEnter={() => onHover('right')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('right')}
          onBlur={() => onHover(null)}
          onClick={() => onSelect('right', '/dashboard')}
          disabled={disabled}
          aria-label="Enter Kingdom — members report to the inner checkpoint"
          data-active={hoveredRoad === 'right'}
        >
          <span className="road-kicker">The Inner Gate</span>
          <span className="road-title">Enter Kingdom</span>
          <span className="road-sub">Members report to the inner checkpoint</span>
        </button>
      </div>

      <a href="#dossier" className="kingdom-explore">
        Explore Kingdom 710 &darr;
      </a>
    </div>
  );
}
