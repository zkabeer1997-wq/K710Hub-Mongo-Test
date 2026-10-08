'use client';

import { createContext, useContext } from 'react';

// When an existing admin page is rendered inside another page (for example the
// KvK event page embeds Appointments), AdminShell skips its own sidebar, h1 and
// <main> and renders only the actions and children.
export const AdminEmbedContext = createContext(false);

export function useAdminEmbedded() {
  return useContext(AdminEmbedContext);
}
