import Breadcrumbs from '../Breadcrumbs';

export default function ToolPage({
  title,
  description,
  backHref = '/tools',
  backLabel = 'Tools & Calculators',
  memberId = '',
  help = null,
  children,
}) {
  // Member context travels on the query string so a click back up the tree
  // keeps the same member selected. Custom backHref values (category and
  // sub-hub links) already embed member_id via their own suffix, so only the
  // two fixed roots need it appended here.
  const mq = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';

  // Full trail: Members › Tools & Calculators › [category] › this tool.
  // The category crumb only appears when a tool overrides backHref to point at
  // a filtered category or a sub-hub (e.g. Research Tools);
  // default tools sit directly under Tools & Calculators.
  const crumbs = [
    { label: 'Members', href: `/dashboard${mq}` },
    { label: 'Tools & Calculators', href: `/tools${mq}` },
  ];
  if (backHref !== '/tools') {
    crumbs.push({ label: backLabel, href: backHref });
  }

  return (
    <main className="armory cost-tool-page">
      <div className="armory-atmos" aria-hidden="true" />
      <span className="armory-rack-l" aria-hidden="true" />
      <span className="armory-rack-r" aria-hidden="true" />
      <div className="armory-inner cost-tool-inner">
        <Breadcrumbs items={crumbs} current={title} />
        <header className="armory-head cost-tool-head">
          <h1 className="k-display armory-title">{title}</h1>
          <p className="k-narrative armory-lede">{description}</p>
        </header>
        {help ? (
          <details className="tool-help">
            <summary>About this tool</summary>
            <div className="tool-help-body">{help}</div>
          </details>
        ) : null}
        {children}
      </div>
      <style>{`
        .cost-tool-page{color:var(--parchment)}
        .cost-tool-inner{width:min(1440px,100%);padding-top:clamp(76px,9vh,108px)}
        .cost-tool-head{margin-bottom:24px}
        @media(max-width:620px){.cost-tool-inner{padding-top:70px}}
      `}</style>
    </main>
  );
}
