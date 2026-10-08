import Link from 'next/link';

export const metadata = {
  title: 'Lost in the Kingdom',
};

export default function NotFound() {
  return (
    <main className="inner-gate-page">
      <div className="inner-gate-card">
        <svg className="inner-gate-crest" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <h1>Lost in the Kingdom</h1>
        <p className="sub">This path doesn&rsquo;t lead anywhere inside Kingdom 710. The page you&rsquo;re looking for may have moved or never existed.</p>
        <Link href="/" className="inner-gate-submit" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
