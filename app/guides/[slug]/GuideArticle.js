'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

function readingTime(body) {
  const words = String(body || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default function GuideArticle({ slug, initialGuide, initialIsAdmin = false, initialError = '', prev, next }) {
  const searchParams = useSearchParams();
  const memberId = searchParams.get('member_id') || '';
  const [guide, setGuide] = useState(initialGuide || null);
  const [isAdmin, setIsAdmin] = useState(Boolean(initialIsAdmin));
  const [error, setError] = useState(initialError || '');
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialGuide?.title || '');
  const [draft, setDraft] = useState(initialGuide?.body || '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [contentTab, setContentTab] = useState('f2p');

  const hasContentTabs = Boolean(guide?.f2p_content || guide?.spender_content);
  const activeContent = !hasContentTabs
    ? guide?.body
    : contentTab === 'spenders'
      ? (guide?.spender_content || guide?.body)
      : (guide?.f2p_content || guide?.body);

  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';
  const guidesHref = `/guides${query}`;

  useEffect(() => {
    if (guide?.title) document.title = `${guide.title} | K710`;
    return () => { document.title = 'Kingdom Guide | K710'; };
  }, [guide?.title]);

  // The server-rendered pass is always anonymous (see page.js - a static
  // route can't read cookies()), so admin state is upgraded here instead.
  // GET /api/guides/[slug] already computes isAdmin per-request via
  // isAdminRequest() and, for an admin, also returns an unpublished guide
  // the static pass would never have fetched. A non-admin visitor gets an
  // identical response back and nothing visibly changes.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guides/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (cancelled || !result) return;
        if (result.isAdmin) {
          setIsAdmin(true);
          if (result.guide) {
            setGuide(result.guide);
            setDraftTitle(result.guide.title || '');
            setDraft(result.guide.body || '');
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);

  async function saveGuide() {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setError('Guide title cannot be blank.');
      return;
    }

    setSaving(true);
    setStatus('');
    setError('');

    try {
      const response = await fetch(`/api/guides/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, max-age=0',
        },
        body: JSON.stringify({ title: nextTitle, body: draft }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save this guide.');
      if (!result.guide) throw new Error('The saved guide was not returned by the server.');

      // Immediately adopt the exact row returned by Supabase.
      setGuide(result.guide);
      setDraftTitle(result.guide.title || '');
      setDraft(result.guide.body || '');
      setEditing(false);
      setStatus('Saved. Reloading the persisted guide…');

      // Full document reload: bypasses Next client router/cache completely.
      // The server-rendered page then reads the row directly from Supabase.
      window.location.replace(`${window.location.pathname}${window.location.search}${window.location.search ? '&' : '?'}saved=${Date.now()}`);
    } catch (err) {
      setError(err.message || 'Unable to save this guide.');
      setSaving(false);
    }
  }

  function cancelEdit() {
    setDraftTitle(guide?.title || '');
    setDraft(guide?.body || '');
    setEditing(false);
    setStatus('');
    setError('');
  }

  if (!guide) {
    return (
      <main className="armory guide-page">
        <div className="armory-atmos" aria-hidden="true" />
        <div className="armory-inner guide-inner">
          <Link href={guidesHref} className="guide-back">← Guides</Link>
          <div className="guide-error k-narrative">{error || 'Guide not found.'}</div>
        </div>
        <style jsx>{`.guide-inner{width:min(940px,100%);padding-top:clamp(82px,10vh,118px)}.guide-back{color:var(--brass);text-decoration:none}.guide-error{margin-top:40px;color:var(--parchment-dim)}`}</style>
      </main>
    );
  }

  return (
    <main className="armory guide-page">
      <div className="armory-atmos" aria-hidden="true" />
      <span className="armory-rack-l" aria-hidden="true" />
      <span className="armory-rack-r" aria-hidden="true" />

      <div className="armory-inner guide-inner">
        <div className="guide-topbar">
          <Link href={guidesHref} className="guide-back">← Guides</Link>
          {isAdmin && <span className="guide-admin-badge">Admin editing available</span>}
        </div>

        <header className="guide-header">
          <span className="k-mark">{guide.category}</span>
          {!editing ? (
            <h1 className="k-display">{guide.title}</h1>
          ) : (
            <div className="guide-title-editor">
              <label htmlFor="guide-title">Guide title</label>
              <input
                id="guide-title"
                type="text"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                maxLength={180}
                autoFocus
              />
            </div>
          )}
          <p className="k-narrative">{guide.description}</p>
          <div className="guide-rule" aria-hidden="true" />
        </header>

        <article className="guide-volume">
          <div className="guide-volume-spine" aria-hidden="true" />
          {!editing ? (
            <div className="guide-body k-narrative">
              {hasContentTabs && (
                <div className="guide-content-tabs" role="tablist" aria-label="Guide content">
                  <button type="button" role="tab" aria-selected={contentTab === 'f2p'} className={contentTab === 'f2p' ? 'is-active' : undefined} onClick={() => setContentTab('f2p')}>F2P</button>
                  <button type="button" role="tab" aria-selected={contentTab === 'spenders'} className={contentTab === 'spenders' ? 'is-active' : undefined} onClick={() => setContentTab('spenders')}>Spenders</button>
                </div>
              )}
              {activeContent ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {activeContent}
                </ReactMarkdown>
              ) : (
                'This guide has not been written yet.'
              )}
            </div>
          ) : (
            <div className="guide-editor">
              <label htmlFor="guide-body">Guide text</label>
              <textarea
                id="guide-body"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck="true"
              />
              <p>Plain text is preserved, including paragraph breaks and lists.</p>
            </div>
          )}
        </article>

        {error && <div className="guide-message error" role="alert">{error}</div>}
        {status && <div className="guide-message success" role="status">{status}</div>}

        {isAdmin && (
          <div className="guide-admin-actions">
            {!editing ? (
              <button type="button" className="k-btn guide-edit" onClick={() => { setEditing(true); setStatus(''); setError(''); }}>
                Edit Guide
              </button>
            ) : (
              <>
                <button type="button" className="k-btn guide-save" onClick={saveGuide} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" className="guide-cancel" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
              </>
            )}
          </div>
        )}

        <footer className="guide-footer">
          <span>{readingTime(guide.body)} min read · Last updated {guide.updated_at ? new Date(guide.updated_at).toLocaleString() : '—'}</span>
          {memberId && <span>Member {memberId}</span>}
        </footer>

        {(prev || next) && (
          <nav className="guide-pager" aria-label="More guides">
            {prev ? (
              <Link href={`/guides/${prev.slug}${query}`} className="guide-pager-link guide-pager-prev">
                <span className="k-mark">← Previous</span>
                <strong>{prev.title}</strong>
              </Link>
            ) : <span />}
            {next ? (
              <Link href={`/guides/${next.slug}${query}`} className="guide-pager-link guide-pager-next">
                <span className="k-mark">Next →</span>
                <strong>{next.title}</strong>
              </Link>
            ) : <span />}
          </nav>
        )}
      </div>

      <style jsx>{`
        .guide-page{color:var(--parchment)}
        .guide-inner{width:min(940px,100%);padding-top:clamp(82px,10vh,118px);padding-bottom:80px}
        .guide-topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:34px;padding-bottom:14px;border-bottom:1px solid var(--edge)}
        .guide-back{color:var(--brass);font-family:var(--font-body);font-size:12px;text-decoration:none;letter-spacing:.06em}
        .guide-back:hover{color:var(--gold-hot)}
        .guide-admin-badge{font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#d8ba6c;border:1px solid rgba(201,164,78,.34);background:rgba(201,164,78,.07);padding:7px 9px}
        .guide-header{max-width:780px;margin-bottom:30px}
        .guide-header h1{margin:9px 0 10px;font-size:clamp(32px,5.4vw,58px);line-height:1.02;letter-spacing:.055em;color:var(--parchment)}
        .guide-header p{margin:0;color:var(--parchment-dim);font-size:17px;line-height:1.65;max-width:65ch}
        .guide-title-editor{margin:12px 0 14px}
        .guide-title-editor label{display:block;margin-bottom:8px;font-family:var(--font-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--brass)}
        .guide-title-editor input{display:block;width:100%;border:1px solid rgba(201,164,78,.38);background:#100f0d;color:var(--parchment);padding:14px 16px;font-family:var(--font-display);font-size:clamp(24px,4vw,42px);letter-spacing:.045em;outline:none}
        .guide-title-editor input:focus{border-color:rgba(233,193,98,.78);box-shadow:0 0 0 2px rgba(201,164,78,.09)}
        .guide-rule{width:120px;height:1px;margin-top:24px;background:linear-gradient(90deg,var(--gold),transparent)}
        .guide-volume{position:relative;min-height:420px;padding:clamp(28px,4vw,48px) clamp(24px,5vw,58px);background:linear-gradient(135deg,rgba(45,35,24,.95),rgba(25,21,17,.98));border:1px solid rgba(201,164,78,.27);box-shadow:0 28px 70px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.025)}
        .guide-volume:before{content:'';position:absolute;inset:10px;border:1px solid rgba(201,164,78,.11);pointer-events:none}
        .guide-volume-spine{position:absolute;left:0;top:0;bottom:0;width:8px;background:linear-gradient(90deg,#1a120b,#79592b,#2b1d10);border-right:1px solid rgba(201,164,78,.35)}
        .guide-body{position:relative;z-index:1;color:#e6dcc2;font-size:17px;line-height:1.82;letter-spacing:.005em}
        .guide-content-tabs{display:flex;gap:6px;margin:0 0 22px;border-bottom:1px solid rgba(201,164,78,.22)}
        .guide-content-tabs button{padding:9px 16px;background:none;border:0;border-bottom:2px solid transparent;font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--parchment-dim);cursor:pointer}
        .guide-content-tabs button.is-active{color:var(--gold-hot);border-bottom-color:var(--gold-hot)}
        .guide-content-tabs button:hover{color:var(--parchment)}
        .guide-content-tabs button:focus-visible{outline:2px solid var(--gold-hot);outline-offset:2px}
        .guide-body :global(img){display:block;max-width:100%;height:auto;margin:1.2em auto;border-radius:6px}
        .guide-body :global(p){margin:0 0 1.1em}
        .guide-body :global(h2){margin:1.6em 0 .6em;font-family:var(--font-display);font-size:26px;letter-spacing:.04em;color:var(--parchment)}
        .guide-body :global(h3){margin:1.4em 0 .5em;font-family:var(--font-display);font-size:20px;letter-spacing:.03em;color:var(--parchment)}
        .guide-body :global(ul),.guide-body :global(ol){margin:0 0 1.1em;padding-left:1.4em}
        .guide-body :global(li){margin:.3em 0}
        .guide-body :global(a){color:var(--gold-hot);text-decoration:underline}
        .guide-body :global(strong){color:var(--parchment)}
        .guide-body :global(blockquote){margin:1em 0;padding:.2em 1em;border-left:2px solid var(--gold-aged);color:var(--parchment-dim)}
        .guide-body :global(code){background:rgba(201,164,78,.12);padding:.1em .4em;border-radius:3px;font-size:.92em}
        .guide-body :global(table){width:100%;border-collapse:collapse;margin:1em 0}
        .guide-body :global(th),.guide-body :global(td){border:1px solid rgba(201,164,78,.22);padding:8px 10px;text-align:left}
        .guide-body :global(hr){border:0;border-top:1px solid rgba(201,164,78,.2);margin:1.6em 0}
        .guide-editor{position:relative;z-index:1}
        .guide-editor label{display:block;margin-bottom:9px;font-family:var(--font-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--brass)}
        .guide-editor textarea{display:block;width:100%;min-height:520px;resize:vertical;border:1px solid rgba(201,164,78,.32);background:#100f0d;color:#eee4ca;padding:18px;font-family:var(--font-body);font-size:16px;line-height:1.68;outline:none}
        .guide-editor textarea:focus{border-color:rgba(233,193,98,.72);box-shadow:0 0 0 2px rgba(201,164,78,.08)}
        .guide-editor p{margin:9px 0 0;color:var(--t-muted);font-size:11px}
        .guide-admin-actions{display:flex;gap:10px;align-items:center;margin-top:20px}
        .guide-edit,.guide-save{min-width:145px;border-color:rgba(201,164,78,.44);background:linear-gradient(180deg,#5f4b27,#312617);color:#f1dc9d}
        .guide-save:disabled{opacity:.58;cursor:wait}
        .guide-cancel{border:0;background:transparent;color:var(--parchment-dim);padding:10px 12px;cursor:pointer;font-family:var(--font-body)}
        .guide-cancel:hover{color:var(--parchment)}
        .guide-message{margin-top:16px;padding:11px 13px;font-size:12px;border:1px solid}
        .guide-message.error{color:#ffc1ad;border-color:rgba(255,125,91,.27);background:rgba(255,94,52,.06)}
        .guide-message.success{color:#c9edcf;border-color:rgba(120,205,137,.25);background:rgba(88,180,106,.06)}
        .guide-footer{display:flex;justify-content:space-between;gap:20px;margin-top:24px;padding-top:15px;border-top:1px solid rgba(201,164,78,.13);color:var(--t-muted);font-family:var(--font-mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase}
        .guide-pager{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
        .guide-pager-link{display:flex;flex-direction:column;gap:6px;padding:16px 18px;border:1px solid var(--edge);text-decoration:none;color:var(--parchment-dim);transition:border-color .16s,color .16s}
        .guide-pager-link:hover{border-color:var(--gold-aged);color:var(--parchment)}
        .guide-pager-link strong{font-family:var(--font-display);font-size:15px;letter-spacing:.03em;color:inherit}
        .guide-pager-next{text-align:right;align-items:flex-end}
        @media(max-width:620px){.guide-pager{grid-template-columns:1fr}.guide-inner{padding-top:72px}.guide-topbar{align-items:flex-start;flex-direction:column}.guide-header h1{font-size:34px}.guide-title-editor input{font-size:28px}.guide-header p,.guide-body{font-size:15px}.guide-volume{padding:26px 20px 30px 28px;min-height:360px}.guide-editor textarea{min-height:440px}.guide-footer{flex-direction:column}.guide-admin-actions{align-items:stretch;flex-direction:column}.guide-edit,.guide-save,.guide-cancel{width:100%}}
      `}</style>
    </main>
  );
}
