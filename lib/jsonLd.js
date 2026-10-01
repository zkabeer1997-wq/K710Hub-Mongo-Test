import { SITE_URL } from './siteUrl';

// Serialize for an inline <script type="application/ld+json">; escaping '<'
// stops a stray "</script>" in any value from closing the tag.
export function jsonLdString(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'Kingdom 710',
  alternateName: 'K710',
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  description: 'Kingdom 710 - a KvK-first Kingshot kingdom run across three coordinated alliances: 710, RED, and SKY.',
};

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: 'K710 Hub',
  url: SITE_URL,
  publisher: { '@id': `${SITE_URL}/#organization` },
  inLanguage: 'en',
};
