import { revalidatePath } from 'next/cache';

export function revalidateAlliancePages(tag) {
  for (const path of ['/', '/about', '/alliances', '/events', '/api/alliance-events', '/api/bear-schedule', '/api/events/bear-hunt.ics']) revalidatePath(path);
  revalidatePath(`/alliances/${tag.toLowerCase()}`);
}
