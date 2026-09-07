import Link from 'next/link';

// items: [{ href, label }] - the last item renders as plain text (current
// page), everything before it is a link. Keep it short; this isn't meant to
// replace a page's <h1>.
export default function Breadcrumb({ items, className = '' }) {
  if (!items?.length) return null;
  return (
    <nav className={`ui-breadcrumb ${className}`} aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.href || item.label}>
              {isLast || !item.href ? (
                <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
              ) : (
                <Link href={item.href}>{item.label}</Link>
              )}
              {!isLast && <span className="ui-breadcrumb-sep" aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
