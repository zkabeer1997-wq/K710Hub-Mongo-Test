// Wraps native <details>/<summary> - the accordion primitive already used
// ad hoc across the tools (see AdvancedSettings in Phase2Planners.jsx) -
// instead of a bespoke open/close state. Free keyboard support and
// find-in-page behavior come from the browser for nothing.
export function Accordion({ className = '', children }) {
  return <div className={`ui-accordion ${className}`}>{children}</div>;
}

export function AccordionItem({ title, defaultOpen = false, children }) {
  return (
    <details className="ui-accordion-item" open={defaultOpen}>
      <summary className="ui-accordion-trigger">{title}</summary>
      <div className="ui-accordion-body">{children}</div>
    </details>
  );
}
