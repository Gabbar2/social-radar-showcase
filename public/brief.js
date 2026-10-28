// Product brief for "Optimise with ChatGPT": works out which product the post is about (media file name first, then
// anything we saved earlier, then the caption). If it can't tell, it asks for the product name, what the content is
// for and any key points — so the caption and hashtags are written about the right thing.
import { h, toast } from './core.js';
import { detectProduct, PURPOSES } from './products.js';

const NEEDS = new Set(['all', 'caption', 'hashtags', 'platforms', 'youtube', 'comment']);

export function createBrief(ctx) {
  const { S } = ctx;
  const D = () => S.draft;

  function detect() {
    const d = D();
    return detectProduct({
      names: d.media.map((m) => m.name),
      texts: [d.caption, d.hashtags],
      known: S.settings.knownProducts || [],
    });
  }

  function ask(pre) {
    return new Promise((resolve) => {
      const files = D().media.map((m) => m.name).join(', ');
      const known = S.settings.knownProducts || [];
      const product = h('input', { class: 'inp', list: 'briefProducts', placeholder: 'e.g. Aurora Boom 5', value: pre.product || pre.brand || '' });
      const purpose = h('select', { class: 'inp' }, PURPOSES.map((p) => h('option', { value: p }, p)));
      const other = h('input', { class: 'inp', placeholder: 'Describe the purpose', hidden: true });
      purpose.addEventListener('change', () => { other.hidden = purpose.value !== 'Other'; });
      const points = h('textarea', { class: 'inp', rows: 3, placeholder: 'Key features, price or offer, dates… (optional)' });
      const link = h('input', { class: 'inp', type: 'url', placeholder: 'https://example.com/… (optional)' });
      const err = h('div', { class: 'warn xs', hidden: true }, 'Enter the product name, or press Skip.');
      const dlg = h('dialog', { class: 'dlg' });
      const close = (val) => { dlg.close(); dlg.remove(); resolve(val); };
      const form = h('div', { class: 'dlg-body' },
        h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Which product is this?'), h('button', { type: 'button', class: 'x', 'aria-label': 'Close', onclick: () => close(null) }, '✕')),
        h('p', { class: 'muted small' }, files ? `I couldn't tell the product from the file name (${files}) or the caption.` : 'I couldn\'t tell the product from the caption.', ' Tell me a little so ChatGPT writes about the right thing.'),
        h('label', { class: 'f' }, h('span', {}, 'Product name'), product, h('datalist', { id: 'briefProducts' }, known.map((k) => h('option', { value: k.name || k })))),
        h('label', { class: 'f' }, h('span', {}, 'What is this content for?'), purpose, other),
        h('label', { class: 'f' }, h('span', {}, 'Key points or offer'), points),
        h('label', { class: 'f' }, h('span', {}, 'Link'), link),
        err,
        h('div', { class: 'row', style: { 'justify-content': 'flex-end', gap: '8px' } },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => close({ skip: true }) }, 'Skip'),
          h('button', { type: 'button', class: 'btn primary', onclick: () => {
            const name = product.value.trim();
            if (!name) { err.hidden = false; product.focus(); return; }
            close({ product: name, brand: pre.brand || '', purpose: purpose.value === 'Other' ? (other.value.trim() || 'Other') : purpose.value, details: points.value.trim(), link: link.value.trim() });
          } }, 'Continue')));
      dlg.append(form); document.body.append(dlg);
      dlg.addEventListener('cancel', () => { dlg.remove(); resolve(null); });
      dlg.showModal(); product.focus();
    });
  }

  function remember(b) {
    const list = S.settings.knownProducts || [];
    if (b.product && !list.some((k) => (k.name || k).toLowerCase() === b.product.toLowerCase())) {
      S.settings.knownProducts = [...list, { name: b.product, brand: b.brand || '' }].slice(-60);
      ctx.saveSettings && ctx.saveSettings();
    }
  }

  // true = go on and build the prompt, false = the user closed the box
  async function ensure(preset, force = false) {
    if (!NEEDS.has(preset)) return true;
    if (D().brief && D().brief.product && !force) return true;
    if (!force && D().brief && D().brief.skipped) return true;
    const r = force ? { found: false, brand: (D().brief && D().brief.brand) || '' } : detect();
    if (r.found) {
      D().brief = { product: r.name, brand: r.brand, category: r.category, tags: r.tags, source: r.source, purpose: '', details: '', link: '' };
      ctx.saveDraft(); ctx.composer.render();
      toast(`Product: ${r.name} (from the ${r.source})`);
      return true;
    }
    const a = await ask({ ...(D().brief || {}), brand: r.brand, product: (D().brief && D().brief.product) || '' });
    if (!a) return false;
    if (a.skip) { D().brief = { skipped: true }; ctx.saveDraft(); return true; }
    const again = detectProduct({ names: [a.product], texts: [] });
    D().brief = { ...a, brand: again.brand || a.brand, category: again.category || '', tags: again.tags || [], source: 'you' };
    remember(D().brief); ctx.saveDraft(); ctx.composer.render();
    return true;
  }

  function lines() {
    const b = D().brief; if (!b || !b.product) return [];
    return [`Product: ${b.product}${b.category ? ` (${b.category})` : ''}`, b.purpose ? `Purpose of this content: ${b.purpose}` : null, b.details ? `Key points / offer: ${b.details}` : null, b.link ? `Link to include: ${b.link}` : null].filter(Boolean);
  }

  function chip() {
    const b = D().brief; if (!b) return null;
    if (b.skipped) return h('div', { class: 'brief-chip xs muted' }, 'No product details given · ', h('button', { type: 'button', class: 'linkish', onclick: async () => { await ensure('all', true); } }, 'Add'));
    return h('div', { class: 'brief-chip xs' }, h('span', { class: 'muted' }, 'Product: '), h('b', {}, b.product), b.purpose ? h('span', { class: 'muted' }, ' · ' + b.purpose) : null, ' · ',
      h('button', { type: 'button', class: 'linkish', onclick: async () => { await ensure('all', true); } }, 'Edit'), ' · ',
      h('button', { type: 'button', class: 'linkish', onclick: () => { D().brief = null; ctx.saveDraft(); ctx.composer.render(); } }, 'Clear'));
  }

  return { ensure, lines, chip, detect };
}
