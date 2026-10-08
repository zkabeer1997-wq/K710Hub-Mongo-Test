import { redirect } from 'next/navigation';

// The KvK roster now lives on the KvK event page.
export default function AdminDashboardPage() {
  redirect('/admin/dashboard/events/kvk?tab=participants');
}
