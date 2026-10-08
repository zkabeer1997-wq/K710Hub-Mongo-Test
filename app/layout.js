import './tokens.css';
import '../components/ui/primitives.css';
import './globals.css';
import './admin-panel.css';
import './kingdom.css';
import './i18n.css';
import './sitewide-parallax.css';
import './sitewide-audit-fixes.css';
import './home-gallery.css';
import './member-center.css';
import './comfort.css';
import { Cinzel, Inter, JetBrains_Mono, Cormorant_Garamond, Fraunces } from 'next/font/google';
import LanguageProvider from '../components/i18n/LanguageProvider';
import BearScheduleProvider from '../components/BearScheduleProvider';
import SiteChrome from '../components/SiteChrome';
import FilipinoTagalogOptions from '../components/i18n/FilipinoTagalogOptions';
import { headers } from 'next/headers';
import { SITE_URL } from '../lib/siteUrl';
import { ToastProvider } from '../components/ui/Toast';

const cinzel = Cinzel({ subsets: ['latin'], weight: ['600', '800', '900'], display: 'swap', variable: '--font-display-loaded' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-body-loaded' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap', variable: '--font-mono-loaded' });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], display: 'swap', variable: '--font-narrative-loaded' });
const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600', '700', '800'], display: 'swap', variable: '--font-fraunces-loaded' });

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'K710 Hub', template: '%s · K710 Hub' },
  description: 'The Kingdom 710 website for events, alliance schedules, member forms, guides, calculators, and transfer applications.',
  applicationName: 'K710 Hub',
  alternates: { canonical: './' },
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }], apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] },
  openGraph: { title: 'K710 Hub', description: 'The Kingdom 710 website for events, alliance schedules, member forms, guides, calculators, and transfer applications.', siteName: 'K710 Hub', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'K710 Hub', description: 'The Kingdom 710 website for events, alliance schedules, member forms, guides, calculators, and transfer applications.' },
};

export const viewport = { themeColor: '#0b0e13', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }) {
  // Reading request headers opts every page into dynamic rendering so Next can
  // stamp the per-request CSP nonce (set in proxy.js) onto its inline scripts.
  await headers();
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${cinzel.variable} ${inter.variable} ${jetbrains.variable} ${cormorant.variable} ${fraunces.variable}`}>
      <body className="theme-console">
        <ToastProvider>
          <LanguageProvider>
            <FilipinoTagalogOptions />
            <BearScheduleProvider><SiteChrome>{children}</SiteChrome></BearScheduleProvider>
          </LanguageProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
