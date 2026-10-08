import { redirect } from 'next/navigation';

export default function AdminFlamedragonPage() {
  redirect('/admin/dashboard/events/flamedragon?tab=participants');
}
