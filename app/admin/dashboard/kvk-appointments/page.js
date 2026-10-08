import { redirect } from 'next/navigation';

export const metadata = { title: 'KvK Appointments' };

// Appointments is a tab of the KvK event page. This address stays so old bookmarks keep working.
export default function KvkAppointmentsRedirect() {
  redirect('/admin/dashboard/events/kvk?tab=appointments');
}
