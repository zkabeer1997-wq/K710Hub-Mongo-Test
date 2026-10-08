'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '../ui/icons';
import FormStatusMark from './FormStatusMark';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';
import { withResults, todoCount } from '../../lib/memberResults.mjs';

// Left rail on member pages (CSS shows it at >=1024px only). Renders nothing
// for signed-out visitors or when the status API is unavailable.
export default function MemberSidebar() {
  const pathname = usePathname();
  const { status } = useMemberFormStatus(pathname);
  if (!status.signedIn || !status.forms?.length) return null;
  const pending = todoCount(status.forms);
  const items = withResults(status.forms, status.results);
  return (
    <nav className="member-sidebar" aria-label="Member forms">
      <p className="member-sidebar-title">
        My forms
        {pending > 0 && <span className="member-sidebar-count"> · {pending} to do</span>}
      </p>
      <ul>
        {items.map((form) => {
          const active = pathname === form.href || pathname.startsWith(`${form.href}/`);
          return (
            <li key={form.key}>
              <Link href={form.href} prefetch={false} className={`${active ? 'active' : ''}${form.kind === 'result' ? ' member-sidebar-result' : ''}`.trim()} aria-current={active ? 'page' : undefined}>
                <Icon name={form.icon} size={16} />
                <span className="member-sidebar-name">{form.shortLabel}</span>
                {form.kind === 'result' ? <span className="member-sidebar-tag">Result</span> : <FormStatusMark status={form} />}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/forms" className="member-sidebar-all">All forms</Link>
    </nav>
  );
}
