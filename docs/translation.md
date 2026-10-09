# How translation works on K710 Hub

Short version: the English text lives in one file. A script translates it **once** into nine
languages and saves the results as files that ship with the site. Visitors never wait for a
translator and nothing is translated in their browser.

| Thing | Where |
| --- | --- |
| English text + a note for translators on every line | `i18n/en.json` |
| Words that must never be translated (KvK, heroes, Power Profile...) | `i18n/glossary.json` |
| One file per language (ko, tl, ar, es, fr, zh, tr, hi, ja) | `i18n/locales/<code>.json` |
| What was translated from which English (so re-runs are cheap) | `i18n/translation-manifest.json` |
| The script | `scripts/translate-catalog.mjs` (`npm run translate`) |

If a key is missing from a language file, or a file is missing or broken, the English text shows.
The site never breaks because of a translation.

## Running the translation (owner)

1. Get a Google Cloud Translation API key (Basic / v2) and put it in `.env.local` as
   `GOOGLE_TRANSLATE_API_KEY=...` (or export it in your terminal). Never commit it.
2. Preview first. This makes no API call and needs no key:

   ```
   npm run translate -- --dry-run
   ```

   It prints, per language, how many strings are new/changed and the characters it would send.
3. Translate everything that is new or changed:

   ```
   npm run translate                # all nine languages
   npm run translate -- --lang es   # one language
   ```

4. Look at the changes (`git diff i18n/`) and commit them.

Re-running is cheap: only keys that are new, or whose English text changed, are sent again. Each
language file says it is machine translated and has `"reviewed": false`.

What the script protects: everything in `i18n/glossary.json` and every `{placeholder}` (such as
`{name}` or `{count}`) is masked before sending and restored afterwards. If a placeholder comes
back damaged, that one string is left out (English shows) and the script tells you which key.

## Adding or changing text in the code

1. Add the line to `i18n/en.json` with `text` and a short `note` (what it means, what to keep in
   English). Use `{name}` for values. For counts add `key.one` and `key.other`.
2. Use it: `const t = useT();` (client) then `t('dash.greeting', { name })`.
   On the server: `const t = await getTranslator(code)` from `lib/i18n/catalog`.
3. Run `npm run translate`.

## Having a bilingual member review a language

1. `npm run translate -- --review-csv es` writes `i18n/review/es.csv` with four columns: key, note,
   English, and the translation. Send it to the reviewer (opens in Excel or Google Sheets).
2. The reviewer edits only the last column and saves as CSV.
3. `npm run translate -- --import-csv es path/to/es.csv` applies their edits.
4. When the language is checked, open `i18n/locales/es.json` and change `"reviewed": false` to
   `"reviewed": true`. (Members never see a "machine translated" message; the flag is for you.)

Reviewed edits are kept: a line is only re-translated when its English text changes.

## Fixing one bad word

Open `i18n/locales/<code>.json`, find the line (search for the English or the key) and edit the
text. Save and commit. That is all. Keep `{placeholders}` exactly as they are.

## Not covered yet

- Text written by admins (announcements, notes) is not translated. A later step could translate
  it when the admin saves it.
- Pages and forms not yet moved into `i18n/en.json` stay in English until they are.
