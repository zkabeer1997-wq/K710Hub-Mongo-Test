'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KVK_ALLIANCES } from '../../../lib/playerCombatOptions.mjs';
import { useFormFieldMeta } from '../../../lib/useFormFieldMeta';
import { useToast } from '../../../components/ui/Toast';

const SECTIONS = ['Tools and Calculators', 'Forms', 'Events', 'Guides', 'General'];
const MAX_MESSAGE_LENGTH = 2000;

export default function WebsiteRequestForm() {
  const [name, setName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [currentAlliance, setCurrentAlliance] = useState('');
  const [section, setSection] = useState('');
  const [message, setMessage] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const { intro, fields } = useFormFieldMeta('requests');
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/website-requests', { cache: 'no-store' });
        const result = await response.json();
        if (response.status === 401) {
          if (!cancelled) setNeedsSignIn(true);
          return;
        }
        if (!response.ok) throw new Error(result.error || 'Could not load your profile.');
        if (!cancelled && result.profile) {
          setName(result.profile.name || '');
          setMemberId(result.profile.member_id || '');
          setCurrentAlliance(result.profile.current_alliance || '');
        }
      } catch (error) {
        if (!cancelled) { setIsError(true); setStatus(error.message); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('');
    setIsError(false);
    if (!currentAlliance || !section || !message.trim()) {
      setIsError(true);
      setStatus('Select your alliance and a section, and describe the improvement you would like.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/website-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_alliance: currentAlliance, section, message: message.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not submit your request.');
      setSubmitted(true);
      setSection('');
      setMessage('');
      setStatus('Thanks - your request has been sent to the admin team.');
      toast.success('Request sent to the admin team.');
    } catch (error) {
      setIsError(true);
      setStatus(error.message || 'Could not submit. Please try again.');
      toast.error(error.message || 'Could not submit. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (needsSignIn) {
    return (
      <div className="public-shell single-form">
        <section className="public-intro">
          <span className="public-kicker">Website Requests</span>
          <h1>Sign in</h1>
          <p>Your session has expired. Sign in again to submit a website request.</p>
        </section>
        <div className="public-form-card">
          <Link href="/player-record">Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="public-shell single-form">
      <section className="public-intro">
        <span className="public-kicker">{intro.kicker}</span>
        <h1>{intro.heading}</h1>
        <p>{intro.description}</p>
        <div className="public-intro-stats" aria-label="Submission checklist">
          <div>
            <strong>1</strong>
            <span>Quick form</span>
          </div>
          <div>
            <strong>5</strong>
            <span>Sections</span>
          </div>
          <div>
            <strong>{submitted ? 'Sent' : 'Open'}</strong>
            <span>Request</span>
          </div>
        </div>
      </section>
      <form className="public-form-card" onSubmit={handleSubmit}>
        <div className="form-section-header">
          <span>Website Requests</span>
          <h2>What would you like to see improved?</h2>
        </div>
        <section className="identity-grid">
          <label>Your name<input value={name} readOnly placeholder="Loading..." /></label>
          <label>Member ID<input value={memberId} readOnly placeholder="Loading..." /></label>
        </section>
        {fields.map((field) => {
          if (field.key === 'current_alliance') {
            return (
              <section className="troop-section public-section" key={field.key}>
                <div className="section-title-row"><span>Alliance</span><h3>Current Alliance</h3><p>{field.help_text}</p></div>
                <label>{field.label}
                  <select value={currentAlliance} onChange={(e) => setCurrentAlliance(e.target.value)}>
                    <option value="">{field.placeholder}</option>
                    {KVK_ALLIANCES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              </section>
            );
          }
          if (field.key === 'section') {
            return (
              <section className="troop-section public-section" key={field.key}>
                <div className="section-title-row"><span>Category</span><h3>Which part of the site?</h3><p>{field.help_text}</p></div>
                <label>{field.label}
                  <select value={section} onChange={(e) => setSection(e.target.value)}>
                    <option value="">{field.placeholder}</option>
                    {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </section>
            );
          }
          if (field.key === 'message') {
            return (
              <section className="troop-section public-section" key={field.key}>
                <div className="section-title-row"><span>Suggestion</span><h3>Describe the improvement</h3><p>{field.help_text}</p></div>
                <label>{field.label}
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={MAX_MESSAGE_LENGTH}
                    rows={6}
                    placeholder={field.placeholder}
                  />
                </label>
              </section>
            );
          }
          return null;
        })}
        {status && <div className={isError ? 'status error' : 'status'}>{status}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Send request'}</button>
      </form>
    </div>
  );
}
