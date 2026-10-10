// A superadmin can remove a member's access (for example when they leave 710).
// The mark lives on the kingshot_users row; sign-in and every session read check it.
export function isAccessRemoved(user) {
  return Boolean(user && user.access_removed_at);
}

export const ACCESS_REMOVED_MESSAGE =
  'This account no longer has access to the Kingdom 710 member area. Ask a superadmin if you think this is a mistake.';
