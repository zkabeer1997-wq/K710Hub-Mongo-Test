# How translation works on K710 Hub

The language button translates the **whole site** into Korean, Tagalog/Filipino, Arabic (right to
left), Spanish, French, Chinese, Turkish, Hindi and Japanese. Two layers work together so nothing
stays English by accident:

| Layer | What it covers | Speed | Quality control |
| --- | --- | --- | --- |
| **A. Catalog** (`i18n/en.json` -> `i18n/locales/<code>.json`) | Core UI: dashboard, header, footer, picker, form error/closed notices (grows file by file) | Instant, ships with the page | Human-reviewable CSV flow |
| **B. Runtime layer** (`/api/translate` + in-page overlay) | **Everything else**: guides, tools, lore, calculators, forms, DB/admin-written text, alt/aria/placeholder/title text, document titles | English shows at once, translations swap in as they arrive (cached after the first visitor) | Manual overrides (`translation_overrides`) always win |

Both use Google Cloud Translation (Basic, v2) and the same protection of game words
(`i18n/glossary.json`: KvK, Kingshot, hero names, ...). Numbers, dates, ids, URLs and gift codes are
never sent. If anything fails, the page simply stays in English.

## What the owner does once the Google key works

1. In Google Cloud > APIs & Services > Credentials open the key: **Application restrictions: None**
   (a website/referrer restriction blocks server use and gives `API_KEY_HTTP_REFERRER_BLOCKED`),
   **API restrictions: Cloud Translation API**. Make sure the API is enabled and billing is on.
2. Put the key in the environment, never in git:
   - local: `.env.local` -> `GOOGLE_TRANSLATE_API_KEY=...`
   - Vercel: Project > Settings > Environment Variables > add `GOOGLE_TRANSLATE_API_KEY` for
     Production (and Preview if wanted), then redeploy.
   - optional: `TRANSLATE_DAILY_CHAR_BUDGET` (default 200000 characters per day, about $4; `0` = never call Google from visitors).
3. Translate the catalog and commit the result:
   `npm run translate -- --dry-run` then `npm run translate` then `git diff i18n/` and commit.
4. Pre-warm the runtime cache so first visitors never wait (needs `MONGODB_URI` too, run it against the site you want warmed):
   `npm run translate:warm -- --dry-run` (counts and cost, no API call), then `npm run translate:warm -- --base https://your-site`.
   Add `--member-id <id>` (dev/test DB only) or `--cookie "k710_member_session=..."` to include member-only pages,
   `--path /guides/some-guide` for pages not linked anywhere, `--lang es` for one language, `--reuse` to skip the crawl.
   Re-runs only pay for new or changed text.

Then open the site, press the language button, choose a language.

## How the runtime layer works (B)

- `components/i18n/TranslationOverlay.jsx` is mounted once in the root layout. When the language is
  not English (and the page is not under `/admin`) it waits for hydration, collects the visible text
  (text blocks, plus `placeholder`, `title`, `aria-label`, `alt`, and the page title), and asks
  `/api/translate` for what it does not already have in the browser cache (localStorage).
- A paragraph with links or bold text is translated as one sentence (`Join the <x1>KvK</x1> prep`),
  so word order stays natural; if the markup does not come back intact it falls back to translating
  the text pieces one by one.
- Text is changed **in place** (text-node/attribute values), never replaced, so React keeps working.
  Switching back to English restores every original. A `MutationObserver` (debounced) translates
  content that appears later. `<option>` values are frozen to English so forms keep working.
- Skipped: `[data-no-translate]`, `.notranslate`, `translate="no"`, `<code>`, `<pre>`, `<textarea>`,
  SVG, text typed by the user, numbers/dates/times, codes/ids/URLs, glossary-only labels, and text the
  catalog already translated.
- Slower than about a second: a small "Translating..." status appears (`aria-live`). If the service
  is down/over budget: a small dismissible notice "Translation is temporarily unavailable" and the page stays English.
- `/api/translate` (POST `{lang, strings[]}`): same-origin only, 40 requests/minute/IP, at most 60
  strings, 2000 characters per string and 12000 per request, only the nine languages, daily
  character budget counted in Mongo (`translation_budget`; if the counter fails it fails open to
  English, never an error page). The key is only read from `GOOGLE_TRANSLATE_API_KEY`; it is sent in
  a request header, never logged or returned.
- Order for every string: **override** (`translation_overrides`) > **cache** (`translation_cache`,
  `_id = sha256(lang + "\n" + normalized English)`) > Google. Admin-written content needs no extra
  work: it goes through the same path the first time someone views it.
- `GOOGLE_TRANSLATE_ENDPOINT` replaces the Google URL (used by the local mock). Anything that is not
  `translation.googleapis.com` is the *mock engine*: its output is stored in a different collection
  (`translation_cache_mock`, auto-expiring) and a different browser-cache namespace, so fake text can never be served to real visitors.

## Fixing a bad translation (overrides)

```
npm run translate:override -- --lang es --text "Save changes" --to "Guardar cambios"
npm run translate:override -- --lang es --text "Save changes" --remove
npm run translate:override -- --list --lang es
```

`--text` is the English exactly as shown on the site. Overrides always beat machine output and the
cache entry for that text is removed. Browsers that already hold the old text keep it until their
cache is cleared (rename the localStorage key prefix `k710-rt-v1:` in `TranslationOverlay.jsx` to force everybody to refresh). For catalog text edit `i18n/locales/<code>.json` or use the CSV review flow below.
A later admin screen can write the same `translation_overrides` documents (`{_id, lang, source, text}`).

## Costs and limits

Google Basic v2 is about **$20 per million characters** (first 500k/month free at the time of writing; check current pricing).
The UI text of the whole site is a few hundred thousand characters per language at most, once. Repeat
visitors cost nothing (Mongo cache + browser cache). The daily budget caps what visitors can trigger.

## Developing and testing without Google

```
npm run translate:mock                         # fake Google on :4455 ("[es Español] text")
GOOGLE_TRANSLATE_ENDPOINT=http://127.0.0.1:4455/language/translate/v2 GOOGLE_TRANSLATE_API_KEY=mock npm run dev
QA_BASE=http://localhost:3000 npm run qa:translation              # crawl every route in all nine languages, report English left over
QA_BASE=http://localhost:3000 node scripts/dev/qa-translation-behavior.mjs   # picker, restore, cache, dynamic content, failure notice
```

Mock output proves the pipeline only. Real Google text has not been judged by a native speaker.

## Catalog (A): running the translation

1. `npm run translate -- --dry-run` previews (no key, no API call).
2. `npm run translate` / `npm run translate -- --lang es` translates new or changed keys. Failures
   print Google's own reason (key removed) and what to check.
3. Commit `i18n/locales/*.json` (they say they are machine translated, `"reviewed": false`).

| Thing | Where |
| --- | --- |
| English text + note for translators | `i18n/en.json` |
| Never-translate words | `i18n/glossary.json` (add a term when the game adds a hero) |
| One file per language | `i18n/locales/<code>.json` |
| Script | `scripts/translate-catalog.mjs` |

### Adding or changing text in the code

1. Add the line to `i18n/en.json` with `text` and a short `note`. `{name}` for values; counts use `key.one` and `key.other`.
2. `const t = useT();` then `t('dash.greeting', { name })` (client) or `await getTranslator(code)` from `lib/i18n/catalog` (server).
3. `npm run translate`.

Anything not yet in the catalog is still translated by layer B, so there is no hurry to move every sentence.

### Having a bilingual member review a language

1. `npm run translate -- --review-csv es` writes `i18n/review/es.csv` (key, note, English, translation).
2. The reviewer edits the last column and saves as CSV.
3. `npm run translate -- --import-csv es path/to/es.csv`.
4. Set `"reviewed": true` in `i18n/locales/es.json` when checked. Reviewed lines are kept on re-runs.

## Known limits

- Text that only appears after an interaction (validation messages, popovers) is translated on first use, not by `translate:warm`.
- Member names and other user-entered names shown as page text may be translated by Google; mark such elements `data-no-translate`.
- Admin pages (`/admin/*`) are intentionally English only: the overlay is off there and the language button is not shown.
- Server-rendered `<title>`/metadata is English in the HTML; the overlay translates the title after load.
- Search engines see English.
