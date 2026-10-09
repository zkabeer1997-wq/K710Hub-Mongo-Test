// Tiny translation runtime shared by client and server components. No dependencies.
//
//   const t = createTranslator({ locale: 'es', messages, fallback });
//   t('dash.greeting', { name: 'Aria' })      // "Hola Aria"
//   t('dash.left', { count: 2 })              // plural: picks dash.left.one / .other / ... by Intl.PluralRules
//
// `messages` and `fallback` are flat { key: string } maps (English text is the fallback). A missing
// key, a missing locale file or a malformed one never throws: the English text (or, last of all,
// the key itself) is returned instead.

const VAR_RE = /\{([a-zA-Z0-9_]+)\}/g;

/** Keep only non-empty string values. Accepts a locale file ({ _meta, strings }) or a flat map. */
export function sanitizeMessages(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const source = raw.strings && typeof raw.strings === 'object' && !Array.isArray(raw.strings) ? raw.strings : raw;
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('_')) continue;
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}

/** Turn the English source file ({ key: { text, note } }) into a flat { key: text } map. */
export function flattenSource(source) {
  const out = {};
  for (const [key, entry] of Object.entries(source || {})) {
    if (key.startsWith('_')) continue;
    const text = typeof entry === 'string' ? entry : entry?.text;
    if (typeof text === 'string') out[key] = text;
  }
  return out;
}

export function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(VAR_RE, (whole, name) => (Object.hasOwn(vars, name) && vars[name] != null ? String(vars[name]) : whole));
}

function pluralCategory(locale, count) {
  try {
    return new Intl.PluralRules(locale).select(Number(count));
  } catch {
    return Number(count) === 1 ? 'one' : 'other';
  }
}

// Exact key first; with a numeric `count`, key.zero (count 0) then key.<category> then key.other.
function pick(messages, key, locale, vars) {
  const hasCount = vars && vars.count != null && Number.isFinite(Number(vars.count));
  if (hasCount) {
    if (Number(vars.count) === 0 && Object.hasOwn(messages, `${key}.zero`)) return messages[`${key}.zero`];
    const category = pluralCategory(locale, vars.count);
    if (Object.hasOwn(messages, `${key}.${category}`)) return messages[`${key}.${category}`];
    if (Object.hasOwn(messages, `${key}.other`)) return messages[`${key}.other`];
  }
  if (Object.hasOwn(messages, key)) return messages[key];
  return undefined;
}

/**
 * @param {{locale?: string, messages?: object, fallback?: object}} options
 */
export function createTranslator({ locale = 'en', messages = {}, fallback = {} } = {}) {
  const own = sanitizeMessages(messages);
  const base = sanitizeMessages(fallback);
  function resolve(key, vars) {
    const mine = pick(own, key, locale, vars);
    if (mine !== undefined) return mine;
    const english = pick(base, key, 'en', vars);
    return english !== undefined ? english : key;
  }
  function t(key, vars) {
    return interpolate(resolve(key, vars), vars);
  }
  /** Segments so a caller can style a variable: [{text}, {text:'3', variable:'count'}, {text}] */
  t.parts = (key, vars) => {
    const template = resolve(key, vars);
    const out = [];
    let last = 0;
    for (const match of template.matchAll(VAR_RE)) {
      if (match.index > last) out.push({ text: template.slice(last, match.index) });
      const has = vars && Object.hasOwn(vars, match[1]) && vars[match[1]] != null;
      out.push(has ? { text: String(vars[match[1]]), variable: match[1] } : { text: match[0] });
      last = match.index + match[0].length;
    }
    if (last < template.length) out.push({ text: template.slice(last) });
    return out;
  };
  t.has = (key) => Object.hasOwn(own, key) || Object.hasOwn(base, key);
  t.locale = locale;
  return t;
}
