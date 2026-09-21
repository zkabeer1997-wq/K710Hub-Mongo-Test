import Link from 'next/link';

export default function ToolPage({
  title,
  description,
  backHref = '/tools',
  backLabel = 'Tools & Calculators',
  memberId = '',
  children,
}) {
  // Member context travels on the query string so a click back up the tree
  // keeps the same member selected. Custom backHref values (category and
  // sub-hub links) already embed member_id via their own suffix, so only the
  // two fixed roots need it appended here.
  const mq = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';

  // Full trail: Members › Tools & Calculators › [category] › this tool.
  // The category crumb only appears when a tool overrides backHref to point at
  // a filtered category or a sub-hub (e.g. Updated Tools, Research Tools);
  // default tools sit directly under Tools & Calculators.
  const crumbs = [
    { label: 'Members', href: `/player-record${mq}` },
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
        <nav className="cost-tool-crumbs" aria-label="Breadcrumb">
          <ol>
            {crumbs.map((crumb) => (
              <li key={crumb.href}>
                <Link href={crumb.href}>{crumb.label}</Link>
              </li>
            ))}
            <li aria-current="page">
              <span>{title}</span>
            </li>
          </ol>
        </nav>
        <header className="armory-head cost-tool-head">
          <h1 className="k-display armory-title">{title}</h1>
          <p className="k-narrative armory-lede">{description}</p>
        </header>
        {children}
      </div>
      <style>{`
        .cost-tool-page{color:var(--parchment)}
        .cost-tool-inner{width:min(1440px,100%);padding-top:clamp(76px,9vh,108px)}
        .cost-tool-crumbs{margin-bottom:24px;padding-bottom:15px;border-bottom:1px solid var(--edge)}
        .cost-tool-crumbs ol{display:flex;flex-wrap:wrap;align-items:center;margin:0;padding:0;list-style:none;font-family:var(--font-body);font-size:12px;letter-spacing:.05em}
        .cost-tool-crumbs li{display:flex;align-items:center;min-width:0}
        .cost-tool-crumbs li+li::before{content:'›';margin:0 10px;color:var(--brass-dim);flex:none}
        .cost-tool-crumbs a{color:var(--brass);text-decoration:none;transition:color .16s ease}
        .cost-tool-crumbs a:hover{color:var(--gold-hot)}
        .cost-tool-crumbs a:focus-visible{outline:2px solid var(--gold-hot);outline-offset:3px;border-radius:2px}
        .cost-tool-crumbs [aria-current="page"] span{color:var(--parchment-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cost-tool-head{margin-bottom:24px}
        @media(max-width:620px){.cost-tool-inner{padding-top:70px}.cost-tool-crumbs ol{font-size:11px}.cost-tool-crumbs li+li::before{margin:0 7px}}
      `}</style>
    </main>
  );
}
