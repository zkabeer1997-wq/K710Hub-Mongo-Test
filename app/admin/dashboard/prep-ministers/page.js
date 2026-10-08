import { redirect } from 'next/navigation';

export const metadata = { title: 'KvK Appointments' };

// Prep ministers and Appointments are ONE flow now: the Appointments tab on the KvK event page.
// This address stays so old bookmarks keep working.
export default function PrepMinistersRedirect() {
  redirect('/admin/dashboard/events/kvk?tab=appointments');
}
