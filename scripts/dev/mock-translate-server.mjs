#!/usr/bin/env node
// Local stand-in for Google Cloud Translation v2 (dev/QA only; nothing here ever talks to Google).
//
//   node scripts/dev/mock-translate-server.mjs [--port 4455]
//   GOOGLE_TRANSLATE_ENDPOINT=http://127.0.0.1:4455/language/translate/v2 GOOGLE_TRANSLATE_API_KEY=mock npm run dev
//
// POST /language/translate/v2   {q: string|string[], source, target, format}  ->  {data:{translations:[{translatedText}]}}
//   Deterministic fake: the first translatable text run of every string gets a marker such as
//   "[ko 한국어] ", so a page that was really sent through the pipeline is obvious at a glance and
//   the glyphs of every language can be checked. HTML tags and <span class="notranslate"> content
//   are left untouched, exactly as Google does in format=html.
// Control (for tests):
//   POST /__mock/mode {mode: "ok"|"error403"|"error500"|"slow", delayMs}
//   GET  /__mock/stats   POST /__mock/reset
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const MARK = {
  ko: '한국어', tl: 'Filipino', ar: 'العربية', es: 'Español', fr: 'Français', zh: '中文', 'zh-CN': '中文', tr: 'Türkçe', hi: 'हिन्दी', ja: '日本語',
};

export function mockTranslateHtml(html, target) {
  const code = target === 'zh-CN' ? 'zh' : target;
  const marker = `[${code} ${MARK[target] || ''}]`.replace(' ]', ']');
  let depth = 0;
  let marked = false;
  return String(html).split(/(<[^>]+>)/).map((piece) => {
    if (piece.startsWith('<')) {
      if (/^<span\b[^>]*notranslate/i.test(piece)) depth += 1;
      else if (depth > 0 && /^<\/span>/i.test(piece)) depth -= 1;
      return piece;
    }
    if (depth > 0 || !piece.trim() || marked) return piece;
    marked = true;
    const lead = piece.match(/^\s*/)[0];
    return `${lead}${marker} ${piece.slice(lead.length)}`;
  }).join('');
}

export function startMockServer({ port = 4455, host = '127.0.0.1' } = {}) {
  const state = { mode: 'ok', delayMs: 0, calls: 0, strings: 0, chars: 0, perLang: {}, keysSeen: 0 };
  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      if (url.pathname === '/__mock/stats') return reply(res, 200, state);
      if (url.pathname === '/__mock/reset') { Object.assign(state, { calls: 0, strings: 0, chars: 0, perLang: {} }); return reply(res, 200, { ok: true }); }
      if (url.pathname === '/__mock/mode') {
        const body = JSON.parse(raw || '{}');
        state.mode = body.mode || 'ok';
        state.delayMs = Number(body.delayMs) || 0;
        return reply(res, 200, { mode: state.mode, delayMs: state.delayMs });
      }
      if (url.pathname !== '/language/translate/v2' || req.method !== 'POST') return reply(res, 404, { error: { code: 404, message: 'Not found' } });
      state.calls += 1;
      if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
      const key = req.headers['x-goog-api-key'] || url.searchParams.get('key');
      if (!key) return reply(res, 403, { error: { code: 403, message: 'The request is missing a valid API key.', errors: [{ reason: 'forbidden' }], status: 'PERMISSION_DENIED' } });
      if (state.mode === 'error403') {
        return reply(res, 403, { error: { code: 403, message: 'Requests from referer <empty> are blocked.', errors: [{ reason: 'forbidden' }], status: 'PERMISSION_DENIED', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] } });
      }
      if (state.mode === 'error500') return reply(res, 500, { error: { code: 500, message: 'Internal error', status: 'INTERNAL' } });
      let body;
      try { body = JSON.parse(raw); } catch { return reply(res, 400, { error: { code: 400, message: 'Invalid JSON payload', status: 'INVALID_ARGUMENT' } }); }
      const q = Array.isArray(body.q) ? body.q : [body.q];
      if (!q.length || q.some((s) => typeof s !== 'string')) return reply(res, 400, { error: { code: 400, message: 'Required text is missing', status: 'INVALID_ARGUMENT' } });
      if (q.length > 128) return reply(res, 400, { error: { code: 400, message: 'Too many text segments', status: 'INVALID_ARGUMENT' } });
      state.strings += q.length;
      state.chars += q.reduce((n, s) => n + s.length, 0);
      state.perLang[body.target] = (state.perLang[body.target] || 0) + q.length;
      const translatedText = (s) => (body.format === 'text' ? `[${body.target}] ${s}` : mockTranslateHtml(s, body.target));
      return reply(res, 200, { data: { translations: q.map((s) => ({ translatedText: translatedText(s), detectedSourceLanguage: body.source || 'en' })) } });
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, state, port })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--port');
  const port = i > 0 ? Number(process.argv[i + 1]) : Number(process.env.MOCK_PORT) || 4455;
  startMockServer({ port }).then(() => console.log(`Mock Google Translate v2 listening on http://127.0.0.1:${port}/language/translate/v2`));
}
