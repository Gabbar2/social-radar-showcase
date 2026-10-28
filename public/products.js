// Recognises which product a post is about, from the media file name, saved names or the caption.
// It only knows the sample brands below and common model words — anything else is asked of the user (see brief.js).
// Replace BRANDS and MODELS with your own catalogue.
const BRANDS = [
  ['Aurora', /\baurora\b/], ['Nimbus', /\bnimbus\b/], ['Hearth', /\bhearth\b/],
];
// [brand, regex on normalised text, category, extra tags, needs the brand word next to it]
const MODELS = [
  ['Aurora', /\bboom(?: ?\d+)?\b/, 'Portable speaker', ['PortableSpeaker', 'BluetoothSpeaker']],
  ['Aurora', /\b(?:flip|clip|pulse) ?\d*\b/, 'Portable speaker', ['PortableSpeaker'], true],
  ['Aurora', /\b(?:tune|live|focus)(?: ?[a-z]+)? ?\d+\b/, 'Headphones', ['Headphones', 'Earbuds'], true],
  ['Nimbus', /\bphone ?\d+(?: ?(?:pro|plus|lite))?\b/, 'Smartphone', ['Smartphone', 'MobileAI']],
  ['Nimbus', /\bfold ?\d+\b/, 'Foldable phone', ['Foldable', 'Smartphone']],
  ['Nimbus', /\bwatch(?: ?(?:pro|\d+))?\b/, 'Wearable', ['Smartwatch', 'Wearables']],
  ['Nimbus', /\bbuds(?: ?(?:pro|lite))?(?: ?\d+)?\b/, 'Earbuds', ['Earbuds']],
  ['Nimbus', /\b(?:tab|book)(?: ?[a-z]*\d*)*\b/, 'Tablet / laptop', ['Tablet']],
  ['Hearth', /\b(?:rice cooker|air purifier|water filter|kettle|blender)\b/, 'Kitchen / home', ['Kitchen', 'SmartHome']],
  ['Hearth', /\b(?:massager|smart scale|body scale)\b/, 'Wellness', ['Wellness', 'SelfCare']],
];
export const PURPOSES = ['New launch', 'Pre-order', 'Promotion / offer', 'Feature highlight', 'Unboxing / review', 'Event / news', 'Other'];
const PURPOSE_TAGS = { 'New launch': ['NewLaunch', 'JustLaunched'], 'Pre-order': ['PreOrder', 'PreOrderNow'], 'Promotion / offer': ['Offer', 'Deals'], 'Feature highlight': ['TechSpotlight'], 'Unboxing / review': ['Unboxing', 'Review'] };

const norm = (s) => String(s || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_\-.+()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
const title = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bM(\d)/g, 'M$1').replace(/\bAi\b/g, 'AI');

function scan(text, brand0) {
  const n = norm(text);
  if (!n) return null;
  for (const [brand, re, cat, tags, needBrand] of MODELS) {
    const m = n.match(re);
    if (m && needBrand && !BRANDS.find(([b]) => b === brand)[1].test(n)) continue; // generic words only count next to the brand
    if (m) { const nm = title(m[0]); return { found: true, brand, name: new RegExp('^' + brand, 'i').test(nm) ? nm : `${brand} ${nm}`, category: cat, tags }; }
  }
  for (const [brand, re] of BRANDS) if (re.test(n)) return { found: false, brand: brand0 || brand };
  return null;
}

// names: media file names; texts: caption/hashtags; known: names the user taught us earlier
export function detectProduct({ names = [], texts = [], known = [] }) {
  let brandOnly = null;
  const check = (str, source) => {
    const nn = norm(str);
    for (const k of known) { const kn = norm(k.name || k); if (kn && kn.length > 2 && nn.includes(kn)) return { found: true, name: k.name || k, brand: k.brand || '', category: k.category || '', tags: k.tags || [], source: 'saved name' }; }
    const r = scan(str);
    if (r && r.found) return { ...r, source };
    if (r && !brandOnly) brandOnly = r.brand;
    return null;
  };
  for (const n of names) { const r = check(n, 'file name'); if (r) return r; }
  for (const t of texts) { const r = check(t, 'caption'); if (r) return r; }
  return { found: false, brand: brandOnly || '' };
}

// Starter hashtags from what we know (ChatGPT refines these using the caption and the video scenes).
export function starterTags(brief, defaults = '') {
  const camel = (s) => String(s || '').replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const out = ['AcmeStudio'];
  if (brief) {
    if (brief.brand) out.push(camel(brief.brand));
    if (brief.product) out.push(camel(brief.product));
    (brief.tags || []).forEach((t) => out.push(t));
    (PURPOSE_TAGS[brief.purpose] || []).forEach((t) => out.push(t));
  }
  const have = new Set(String(defaults).match(/#[\p{L}\p{N}_]+/gu) || []);
  return [...new Set(out)].filter(Boolean).map((t) => '#' + t).filter((t) => !have.has(t));
}
