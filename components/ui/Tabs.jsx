// A small controlled tab switcher. Deliberately dumb - it renders buttons
// and calls onChange, the caller owns which panel is shown. Reach for this
// instead of a bespoke pair of buttons whenever a page needs a 2-4 way
// top-level view switch (Optimize/Plan, list/grid, etc).
export default function Tabs({ tabs, activeId, onChange, className = '' }) {
  return (
    <div className={`ui-tabs ${className}`} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ui-tab${active ? ' is-active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
