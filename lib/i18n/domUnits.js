// Browser-side half of the runtime translation layer: finds the visible text of a page, groups it into
// translation units, applies translations by swapping text-node / attribute values (never replacing
// nodes, so React keeps working) and restores the English originals on request.
//
// Only imports ./units.mjs. scripts/translate-warm.mjs and scripts/dev/qa-translation-coverage.mjs
// load the overlay in a real browser, so this file needs no Node APIs.
import {
  distributeUnit, escapeUnitText, isTranslatableText, normalizeUnit, splitEdges,
} from './units.mjs';

export const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP', 'TEXTAREA', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'TEMPLATE', 'MATH', 'AUDIO', 'VIDEO', 'HEAD',
]);
const INLINE_TAGS = new Set(['A', 'SPAN', 'B', 'STRONG', 'EM', 'I', 'U', 'SMALL', 'MARK', 'SUB', 'SUP', 'ABBR', 'TIME', 'CITE', 'DFN', 'Q', 'S', 'DEL', 'INS', 'BDI', 'BDO']);
// Opt-outs. data-no-translate is the documented one; data-k710-no-translate and the standard
// translate="no" / .notranslate (also used by the old system) keep working.
export const SKIP_SELECTOR = '[data-no-translate],[data-k710-no-translate],.notranslate,[translate="no"],[contenteditable=""],[contenteditable="true"]';

/** State shared by scans: what was translated, so it can be recognised, skipped and restored. */
export function createState() {
  return { nodes: new Map(), attrs: new Map(), badBlocks: new WeakSet(), dead: new WeakSet() };
}

function isSkipped(el) {
  return SKIP_TAGS.has(el.tagName.toUpperCase()) || el.matches(SKIP_SELECTOR);
}

/** The English text of a node: its tracked original while our translation is still in it, else its live value. */
function origOf(node, state) {
  const tracked = state.nodes.get(node);
  return tracked && node.data === tracked.applied ? tracked.orig : node.data;
}
function isApplied(node, state) {
  const tracked = state.nodes.get(node);
  return Boolean(tracked && node.data === tracked.applied);
}

function mergeableInline(el, state) {
  if (!INLINE_TAGS.has(el.tagName.toUpperCase()) || isSkipped(el)) return false;
  let text = '';
  for (const child of el.childNodes) {
    if (child.nodeType === 8) continue; // <!-- --> separators React writes between adjacent text nodes
    if (child.nodeType !== 3) return false;
    text += child.data;
  }
  void state;
  return text.trim() !== '';
}

/**
 * Collect the units under `root` that still need translating.
 * @param {Element} root
 * @param {{state: object, glossaryRe?: RegExp|null, isCatalogText?: (s:string)=>boolean, lang?: string|null}} ctx
 * @returns {Array<object>} units: {kind:'text'|'attr', key, edges, ...apply data}
 */
export function collectUnits(root, ctx) {
  const { state, glossaryRe = null, isCatalogText = null, lang = null } = ctx;
  const units = [];
  if (!root || root.nodeType !== 1) return units;
  if (root.closest && root.closest(SKIP_SELECTOR) && root.parentElement) return units;

  const wanted = (core) => isTranslatableText(core, { glossaryRe, lang }) && !(isCatalogText && isCatalogText(core));

  function addAttrs(el) {
    for (const attr of ATTRIBUTES) {
      if (!el.hasAttribute(attr)) continue;
      const tracked = state.attrs.get(el)?.get(attr);
      const live = el.getAttribute(attr);
      if (tracked && live === tracked.applied) continue;
      const core = normalizeUnit(live);
      if (wanted(core)) units.push({ kind: 'attr', el, attr, key: escapeUnitText(core), edges: { lead: '', trail: '' } });
    }
  }

  function textUnitFor(el, children) {
    // children: an array of consecutive child nodes forming one candidate unit (text + mergeable inline elements)
    let raw = '';
    const slots = [{ nodes: [] }];
    const inlines = [];
    for (const child of children) {
      if (child.nodeType === 3) {
        raw += escapeUnitText(origOf(child, state));
        slots[slots.length - 1].nodes.push(child);
      } else {
        const id = inlines.length + 1;
        const innerNodes = [...child.childNodes].filter((n) => n.nodeType === 3);
        raw += `<x${id}>${innerNodes.map((n) => escapeUnitText(origOf(n, state))).join('')}</x${id}>`;
        inlines.push({ id, el: child, nodes: innerNodes });
        slots.push({ nodes: [] });
      }
    }
    const edges = splitEdges(raw);
    const key = normalizeUnit(edges.core);
    return {
      kind: 'text', el, key, edges, slots, inlines, nodes: children.filter((c) => c.nodeType === 3),
    };
  }

  function consider(unit) {
    const allNodes = [...unit.nodes, ...unit.inlines.flatMap((i) => i.nodes)];
    if (state.dead.has(unit.el)) return;
    if (allNodes.length && allNodes.every((n) => isApplied(n, state))) return; // already translated
    if (!wanted(unit.key)) return;
    units.push(unit);
  }

  function addTextUnits(el) {
    const children = [...el.childNodes].filter((c) => c.nodeType === 3 || c.nodeType === 1);
    if (!children.some((c) => c.nodeType === 3 && c.data.trim())) return;
    const hasInline = children.some((c) => c.nodeType === 1);
    const allMergeable = hasInline && children.every((c) => c.nodeType === 3 || (c.nodeType === 1 && mergeableInline(c, state)));
    const perfect = allMergeable && children[0].nodeType === 3 && children[children.length - 1].nodeType === 3 && !state.badBlocks.has(el);
    if (!hasInline || perfect) {
      consider(textUnitFor(el, children));
      if (perfect) for (const child of children) if (child.nodeType === 1) handled.add(child);
      return;
    }
    // Markup we cannot carry (or a block that already failed to map back): one unit per run of text nodes.
    let run = [];
    const flush = () => { if (run.length) { consider(textUnitFor(el, run)); run = []; } };
    for (const child of children) {
      if (child.nodeType === 3) run.push(child);
      else flush();
    }
    flush();
  }

  const handled = new Set(); // inline elements already carried inside their parent's sentence
  const stack = [root];
  while (stack.length) {
    const el = stack.pop();
    if (el.nodeType !== 1 || isSkipped(el)) continue;
    addAttrs(el);
    if (handled.has(el)) continue;
    addTextUnits(el);
    for (let i = el.children.length - 1; i >= 0; i -= 1) stack.push(el.children[i]);
  }
  return units;
}

function track(state, node, applied) {
  const previous = state.nodes.get(node);
  const orig = previous && node.data === previous.applied ? previous.orig : node.data;
  node.data = applied;
  state.nodes.set(node, { orig, applied });
}

function trackAttr(state, el, attr, applied) {
  let map = state.attrs.get(el);
  if (!map) { map = new Map(); state.attrs.set(el, map); }
  const previous = map.get(attr);
  const live = el.getAttribute(attr);
  const orig = previous && live === previous.applied ? previous.orig : live;
  el.setAttribute(attr, applied);
  map.set(attr, { orig, applied });
}

function freezeOptionValue(node) {
  const parent = node.parentElement;
  if (parent && parent.tagName === 'OPTION' && !parent.hasAttribute('value')) parent.setAttribute('value', parent.value);
}

/**
 * Write a translation into the DOM. `translated` is in unit form (entity-encoded, <xN> tags).
 * Returns false (and changes nothing) when it cannot be mapped back onto the existing markup.
 */
export function applyUnit(unit, translated, state) {
  if (unit.kind === 'attr') {
    const parts = distributeUnit(translated, unit.key);
    if (!parts || parts.texts.length !== 1) return false;
    trackAttr(state, unit.el, unit.attr, parts.texts[0]);
    return true;
  }
  const parts = distributeUnit(translated, unit.key);
  if (!parts || parts.texts.length !== unit.slots.length) return false;
  for (let k = 0; k < unit.slots.length; k += 1) {
    if (!unit.slots[k].nodes.length && parts.texts[k].trim()) return false; // no node to hold this text
  }
  for (const inline of unit.inlines) if (!inline.nodes.length || (parts.inner[inline.id] ?? '') === '') return false;
  const last = unit.slots.length - 1;
  unit.slots.forEach((slot, k) => {
    if (!slot.nodes.length) return;
    let text = parts.texts[k];
    if (k === 0) text = unit.edges.lead + text;
    if (k === last) text += unit.edges.trail;
    slot.nodes.forEach((node, n) => { freezeOptionValue(node); track(state, node, n === 0 ? text : ''); });
  });
  for (const inline of unit.inlines) {
    inline.nodes.forEach((node, n) => track(state, node, n === 0 ? parts.inner[inline.id] : ''));
  }
  return true;
}

/** Mark a block whose translation did not map back, so the next scan translates its text runs one by one. */
export function markBadBlock(unit, state) {
  if (!unit.el || unit.kind !== 'text') return false;
  if (state.badBlocks.has(unit.el)) { state.dead.add(unit.el); return false; } // failed twice: leave it in English
  state.badBlocks.add(unit.el);
  return true;
}

/** Put every English original back (only where our translation is still in place). */
export function restoreAll(state) {
  for (const [node, tracked] of state.nodes) if (node.data === tracked.applied) node.data = tracked.orig;
  for (const [el, map] of state.attrs) {
    for (const [attr, tracked] of map) if (el.getAttribute(attr) === tracked.applied) el.setAttribute(attr, tracked.orig);
  }
  state.nodes.clear();
  state.attrs.clear();
  state.badBlocks = new WeakSet();
  state.dead = new WeakSet();
}

/** Drop bookkeeping for nodes that left the document. */
export function prune(state) {
  for (const node of [...state.nodes.keys()]) if (!node.isConnected) state.nodes.delete(node);
  for (const el of [...state.attrs.keys()]) if (!el.isConnected) state.attrs.delete(el);
}
