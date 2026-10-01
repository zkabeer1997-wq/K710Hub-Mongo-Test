const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SOURCE_DIRS = ['app', 'components', 'lib'];
const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.css']);
const OUTPUT = process.env.UI_STRINGS_OUT ? path.resolve(process.env.UI_STRINGS_OUT) : path.join(ROOT, 'public', 'ui-strings.json');

function normalize(value) {
  return value
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\`/g, '`')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeUiText(value) {
  if (!value || value.length > 320) return false;
  if (!/\p{L}/u.test(value)) return false;
  if (/^(https?:|mailto:|tel:|data:|\/|\.\/|\.\.\/)/i.test(value)) return false;
  if (/^[A-Za-z0-9_.-]+\.(js|jsx|ts|tsx|css|json|png|jpg|jpeg|webp|svg|woff2?)$/i.test(value)) return false;
  return true;
}

function addCandidate(set, raw) {
  const value = normalize(raw);
  if (looksLikeUiText(value)) set.add(value);
}

function extractQuotedStrings(source, set) {
  for (let i = 0; i < source.length; i += 1) {
    const quote = source[i];
    if (quote !== '"' && quote !== "'") continue;

    let value = '';
    let escaped = false;
    let closed = false;
    for (let j = i + 1; j < source.length; j += 1) {
      const ch = source[j];
      if (escaped) {
        value += `\\${ch}`;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        i = j;
        closed = true;
        break;
      }
      if (ch === '\n' || ch === '\r') break;
      value += ch;
    }
    if (closed) addCandidate(set, value);
  }
}

function extractStaticTemplateStrings(source, set) {
  const templateRe = /`([^`]*?)`/gs;
  for (const match of source.matchAll(templateRe)) {
    const value = match[1];
    if (!value.includes('${')) addCandidate(set, value);
  }
}

function extractJsxText(source, set) {
  const jsxTextRe = />\s*([^<>{}][^<>{}]*)\s*</g;
  for (const match of source.matchAll(jsxTextRe)) addCandidate(set, match[1]);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

const strings = new Set();
const files = SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  extractQuotedStrings(source, strings);
  extractStaticTemplateStrings(source, strings);
  extractJsxText(source, strings);
}

const output = [...strings].sort((a, b) => a.localeCompare(b));
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Generated ${output.length} translatable UI strings -> ${path.relative(ROOT, OUTPUT)}`);
