// Dependency-free so validators (and client code) can share it without pulling in node:crypto.
export const SITE_IMAGE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
