import { redirect } from 'next/navigation';

export const metadata = { title: 'Noble Advisor Schedule' };

// The Noble advisor schedule lives on the Flamedragon Tyrant event page. Old bookmarks land there.
export default function NobleAdvisorRedirect() {
  redirect('/admin/dashboard/events/flamedragon?tab=noble');
}
