import Link from 'next/link';

/**
 * Shared breadcrumb trail (Members › Tools & Calculators › Current page).
 * `items` are linked ancestors [{ label, href }]; `current` is the page name.
 */
export default function Breadcrumbs({ items = [], current }) {
  return (
    <>
      <nav className="cost-tool-crumbs" aria-label="Breadcrumb">
        <ol>
          {items.map((crumb) => (
            <li key={crumb.href}>
              <Link href={crumb.href}>{crumb.label}</Link>
            </li>
          ))}
          <li aria-current="page">
            <span>{current}</span>
          </li>
        </ol>
      </nav>
      <style>{`
        .cost-tool-crumbs{margin-bottom:24px;padding-bottom:15px;border-bottom:1px solid var(--edge)}
        .cost-tool-crumbs ol{display:flex;flex-wrap:wrap;align-items:center;margin:0;padding:0;list-style:none;font-family:var(--font-body);font-size:12px;letter-spacing:.05em}
        .cost-tool-crumbs li{display:flex;align-items:center;min-width:0}
        .cost-tool-crumbs li+li::before{content:'›';margin:0 10px;color:var(--brass-dim);flex:none}
        .cost-tool-crumbs a{color:var(--brass);text-decoration:none;transition:color .16s ease}
        .cost-tool-crumbs a:hover{color:var(--gold-hot)}
        .cost-tool-crumbs a:focus-visible{outline:2px solid var(--gold-hot);outline-offset:3px;border-radius:2px}
        .cost-tool-crumbs [aria-current="page"] span{color:var(--parchment-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        @media(max-width:620px){.cost-tool-crumbs ol{font-size:11px}.cost-tool-crumbs li+li::before{margin:0 7px}}
      `}</style>
    </>
  );
}
