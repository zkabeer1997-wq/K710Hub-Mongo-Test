import { SITE_URL as BASE_URL } from '../lib/siteUrl';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api', '/dashboard/form', '/power-profile', '/flamedragon', '/prep-phase-backpack', '/forms', '/tools'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
