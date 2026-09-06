import Link from "next/link";
export default function ToolPage({
  title,
  description,
  backHref = "/tools",
  backLabel = "Tools & Calculators",
  memberId = "",
  children,
}) {
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : "";
  const resolvedBackHref = backHref.includes("?")
    ? backHref
    : `${backHref}${query}`;
  return (
    <main className="armory cost-tool-page">
      <div className="armory-atmos" aria-hidden="true" />
      <span className="armory-rack-l" aria-hidden="true" />
      <span className="armory-rack-r" aria-hidden="true" />
      <div className="armory-inner cost-tool-inner">
        <div className="cost-tool-nav">
          <Link href={resolvedBackHref}>← {backLabel}</Link>
          <div className="cost-tool-nav-actions">
            <Link href={`/power-profile${query}`}>Player Profile</Link>
            <span className="k-mark">
              {backHref === "/tools" ? title : backLabel}
            </span>
          </div>
        </div>
        <header className="armory-head cost-tool-head">
          <h1 className="k-display armory-title">{title}</h1>
          <p className="k-narrative armory-lede">{description}</p>
        </header>
        {children}
      </div>
      <style>{`.cost-tool-page{color:var(--parchment)}.cost-tool-inner{width:min(1440px,100%);padding-top:clamp(76px,9vh,108px)}.cost-tool-nav,.cost-tool-nav-actions{display:flex;align-items:center;gap:18px}.cost-tool-nav{justify-content:space-between;margin-bottom:24px;padding-bottom:15px;border-bottom:1px solid var(--edge)}.cost-tool-nav a{color:var(--brass);font-family:var(--font-body);font-size:12px;letter-spacing:.05em;text-decoration:none}.cost-tool-nav a:hover{color:var(--gold-hot)}.cost-tool-head{margin-bottom:24px}@media(max-width:620px){.cost-tool-nav{align-items:flex-start;flex-direction:column}.cost-tool-nav-actions{width:100%;justify-content:space-between}.cost-tool-inner{padding-top:70px}}`}</style>
    </main>
  );
}
