import './tokens.css';
import '../components/ui/primitives.css';
import './globals.css';
import './admin-panel.css';
import './kingdom.css';
import './world-scene.css';
import './i18n.css';
import './sitewide-parallax.css';
import './admin-v2.css';
import './sitewide-audit-fixes.css';
import './home-gallery.css';
import './ux-polish.css';
import { Cinzel, Inter, JetBrains_Mono, Cormorant_Garamond, Fraunces } from 'next/font/google';
import LanguageProvider from '../components/i18n/LanguageProvider';
import BearScheduleProvider from '../components/BearScheduleProvider';
import SiteChrome from '../components/SiteChrome';
import FilipinoTagalogOptions from '../components/i18n/FilipinoTagalogOptions';

const cinzel = Cinzel({ subsets: ['latin'], weight: ['600', '800', '900'], display: 'swap', variable: '--font-display-loaded' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-body-loaded' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap', variable: '--font-mono-loaded' });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], display: 'swap', variable: '--font-narrative-loaded' });
const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600', '700', '800'], display: 'swap', variable: '--font-fraunces-loaded' });

export const metadata = {
  metadataBase: new URL('https://k710hub.vercel.app'),
  title: { default: 'K710 Hub', template: '%s · K710 Hub' },
  description: 'The Kingdom 710 website for events, alliance schedules, member forms, guides, calculators, and transfer applications.',
  applicationName: 'K710 Hub',
  openGraph: { title: 'K710 Hub', description: 'The Kingdom 710 website for events, alliance schedules, member forms, guides, calculators, and transfer applications.', siteName: 'K710 Hub', type: 'website' },
};

export const viewport = { themeColor: '#0b0e13', width: 'device-width', initialScale: 1 };

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Kingdom 710',
  alternateName: 'K710',
  url: 'https://k710hub.vercel.app',
  description: 'Kingdom 710 — a KvK-first Kingshot kingdom run across three coordinated alliances: 710, RED, and SKY.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${inter.variable} ${jetbrains.variable} ${cormorant.variable} ${fraunces.variable}`}>
      <body className="theme-console">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <LanguageProvider>
          <FilipinoTagalogOptions />
          <BearScheduleProvider><SiteChrome>{children}</SiteChrome></BearScheduleProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
