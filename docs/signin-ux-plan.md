# Member sign-in UX: files and plan

Branch: `feat/signin-ux` (from `main`). UI only: no change to auth logic, session length, API routes, `proxy.js`, `lib/memberAuth*`, `lib/kingshotLogin*`, or the Apply flow.

## Files found

| Area | File |
| --- | --- |
| Header (desktop `site-nav`, mobile `site-nav-mobile`, `site-nav-cta`) | `components/SiteHeader.js` |
| Footer (MEMBERS column) | `components/SiteFooter.js` |
| Which pages get header/ticker/sidebar | `components/SiteChrome.jsx` |
| Home hero + "What do you need?" (`COMMAND`) | `app/page.js` (styles in minified `app/sitewide-parallax.css`, `app/comfort.css`) |
| Sign-in page / `/dashboard?next=` | `app/login/page.js`, `app/dashboard/page.js`, `app/dashboard/PlayerRecordGate.js`, `app/dashboard/member-login.module.css` |
| Signed-in vs signed-out state in the chrome | `lib/useMemberFormStatus.js` (`/api/member-form-status` -> `signedIn`); the header, sidebar and dashboard card share it |
| Deadline ticker | `components/member/DeadlineTicker.jsx`, `components/member/deadline-ticker.css`, `app/member-center.css`, `app/comfort.css` |
| Easy view toggle (`localStorage k710-easy-view`) | `components/EasyViewToggle.jsx`, `app/comfort.css` |
| Routes that require sign-in | `proxy.js` `MEMBER_PREFIXES` (/forms, /dashboard/form, /power-profile, /flamedragon, /prep-phase-backpack, /tools). /events and the /guides list are public; single guides can be members-only (`access_level === 'members'` in `app/guides/[slug]/page.js`) |
| Help wording | `app/help/page.js` (`#signin`, `#nocode`) |
| i18n | `i18n/en.json` (`{text,note}`), `useT()` in `components/i18n/LanguageProvider.jsx` |
| Existing error pattern | `.field-error` in `app/interest/apply.css` (16px, "!" badge, `#ffb4a8`) |

## Findings that shape the plan

- Personal-code view: the server sets `awaiting_personal_code` in the sealed login-flow cookie only when `send-code` fails or is rate limited (`personalCodeAllowed`). `verify-personal-code` answers 409 unless that cookie state is set. The client cannot enter the view on its own, so a "use my personal code" link from the code step would be a dead end. Not built; reported.
- Re-sending is NOT supported: `send-code` only works from `awaiting_game_confirmation`; a second call answers "not waiting for game confirmation" and the server then switches the flow to the personal-code step. So there is no Resend button; the help box has "Try again", which repeats step 1 (`/api/login/start`) with the Player ID typed on the screen and returns to the game step.
- Last Player ID: not stored anywhere in the app today, so no prefill and no new storage.
- `/help` has the Player ID wording; `public/help/player-id.png` does not exist, so the help block is text-only with a TODO for the image.
- Old `isSafeNext` accepted `/\evil.com` and `/<TAB>/evil.com` (browsers read both as `//evil.com`). Replaced with a stricter check in `lib/signinNext.mjs`, with tests.

## Plan

1. `lib/signinNext.mjs` (+ `tests/signinNext.test.mjs`): `isSafeNext`, `nextPageKey`, `routeNeedsSignIn`; a test keeps the route list in sync with `proxy.js`.
2. `i18n/en.json`: `signin.*` keys.
3. Header/menu/footer/hero/home tags: "Sign in" only when signed out (client state from `useMemberFormStatus`); header also refreshes on `k710-auth-changed`.
4. `PlayerRecordGate` + CSS: mobile order, 16px/48px inputs, error pattern, Player ID disclosure, code-step "Didn't get a code?" help block (link always visible, opens by itself after 30s; no Resend, no personal-code link), banner in card, help link style, confirmation, new trust line.
5. Ticker: one line on phones, hidden on the sign-in gate on phones. Easy view toggle: "Bigger text" wording.
6. Verify: `npm test`, eslint, Playwright at 1440x900 and 390x844 with before/after screenshots.

Not built (owner to decide): the one-time "Text too small? Turn on bigger text" prompt.
