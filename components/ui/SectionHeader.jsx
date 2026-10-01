// Shared section heading: eyebrow (Cinzel, small) + H2 (Fraunces) + lede.
// Colours come from --sh-ink / --sh-muted / --sh-accent so it works on both
// dark (console) and cream (realm) grounds; override those on a wrapper if a
// section sits on an unusual background.
export default function SectionHeader({
  eyebrow,
  title,
  lede,
  actions,
  as: Tag = 'h2',
  align = 'left',
  id,
  className = '',
}) {
  return (
    <div className={`sh sh--${align} ${className}`.trim()}>
      <div className="sh-copy">
        {eyebrow && <p className="sh-eyebrow">{eyebrow}</p>}
        <Tag className="sh-title" id={id}>{title}</Tag>
        {lede && <p className="sh-lede">{lede}</p>}
      </div>
      {actions && <div className="sh-actions">{actions}</div>}
    </div>
  );
}
