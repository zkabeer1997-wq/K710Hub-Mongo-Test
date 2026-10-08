'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * Success screen after the transfer application is stored. A calm in-page
 * card (no animation): says what happens next in plain words and shows the
 * reference code with a Copy button.
 */
export default function SealedPetition({ intakePeriod, discordUsername, reference }) {
  const headingRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { headingRef.current?.focus(); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reference);
    } catch {
      const area = document.createElement('textarea');
      area.value = reference;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const statusHref = reference ? `/interest/status?reference=${encodeURIComponent(reference)}` : '/interest/status';

  return (
    <section className="apply-done" aria-labelledby="apply-done-title">
      <p className="apply-done-tick" aria-hidden="true">✓</p>
      <h2 id="apply-done-title" ref={headingRef} tabIndex={-1}>Your application was sent</h2>
      <p className="apply-done-lede">
        Thank you. Our officers received it{intakePeriod ? <> for the <strong>{intakePeriod}</strong> transfer window</> : ''}.
      </p>

      {reference && (
        <div className="apply-ref">
          <p className="apply-ref-label">Your reference code</p>
          <p className="apply-ref-code" aria-label={`Reference code ${reference.split('').join(' ')}`}>{reference}</p>
          <button type="button" className="k-btn" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button>
          <p className="apply-hint">Save it: copy it, or take a screenshot of this screen. You need it to check your application later.</p>
        </div>
      )}

      <h3>What happens next</h3>
      <ol className="apply-next">
        <li>An officer reads your answers and screenshots.</li>
        <li>
          We contact you on Discord{discordUsername ? <> as <strong>{discordUsername}</strong></> : ''}.
          Check your Discord messages, and the “Message requests” folder too.
        </li>
        <li>We cannot promise a date. You do not need to send the form again.</li>
      </ol>

      <div className="apply-done-actions">
        <Link href={statusHref} className="k-btn">Check my application</Link>
        <Link href="/help" className="k-btn k-btn-quiet">Help</Link>
        <Link href="/" className="k-btn k-btn-quiet">Back to home</Link>
      </div>
    </section>
  );
}
