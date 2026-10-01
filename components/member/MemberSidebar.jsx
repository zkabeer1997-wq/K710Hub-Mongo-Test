'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '../ui/icons';
import FormStatusMark from './FormStatusMark';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';

// Left rail on member pages (CSS shows it at >=1024px only). Renders nothing
// for signed-out visitors or when the status API is unavailable.
export default function MemberSidebar() {
  const pathname = usePathname();
  const { status } = useMemberFormStatus(pathname);
  if (!status.signedIn || !status.forms?.length) return null;
  const pending = status.forms.filter((f) => f.needsInput).length;
  return (
    <nav className="member-sidebar" aria-label="Member forms">
      <p className="member-sidebar-title">
        My forms
        {pending > 0 && <span className="member-sidebar-count"> · {pending} to do</span>}
      </p>
      <ul>
        {status.forms.map((form) => {
          const active = pathname === form.href || pathname.startsWith(`${form.href}/`);
          return (
            <li key={form.key}>
              <Link href={form.href} prefetch={false} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                <Icon name={form.icon} size={16} />
                <span className="member-sidebar-name">{form.shortLabel}</span>
                <FormStatusMark status={form} />
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/forms" className="member-sidebar-all">All forms</Link>
    </nav>
  );
}
