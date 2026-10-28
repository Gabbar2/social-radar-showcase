// ChatGPT card. In the Windows app the real chatgpt.com (your own login) sits inside the card: "Send to ChatGPT"
// types the prompt for you and "Use reply" reads the answer back into the composer. In a normal browser it
// opens ChatGPT in a tab with the prompt filled in, and you paste the reply back here.
import { h, $, I, DESKTOP, toast, copyText, P, PLATFORMS, touchDevice , fill } from './core.js';
import { starterTags } from './products.js';

const LABELS = {
  caption: /^caption$/i, hashtags: /^hashtags?$/i, alt: /^alt[ -]?text(?:\s*(\d+))?$/i, ytTitle: /^youtube title$/i,
  ytTags: /^youtube tags$/i, ytDesc: /^youtube description$/i, firstComment: /^first comment$/i, reply: /^repl(?:y|ies)$/i,
  custom_ig: /^instagram caption$/i, custom_fb: /^facebook caption$/i, custom_tt: /^tiktok caption$/i, custom_li: /^linkedin (?:post|caption)$/i,
};

// Read "LABEL: text" sections out of ChatGPT's answer (tolerates **bold**, ### headings and bullets).
export function parseReply(text) {
  const out = {};
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let key = null, buf = [], idx = null;
  const flush = () => {
    if (!key) return;
    const v = buf.join('\n').trim().replace(/^["“]|["”]$/g, '').trim();
    if (key === 'alt') { out.alt = out.alt || []; out.alt[(idx || 1) - 1] = v; }
    else if (v) out[key] = v;
  };
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:#{1,4}\s*)?(?:[-*•]\s*)?\**\s*([A-Za-z][A-Za-z \-]{2,30}?(?:\s*\d+)?)\s*\**\s*[:：]\s*\**\s*(.*)$/);
    const label = m && m[1].trim();
    const k = label && Object.keys(LABELS).find((x) => LABELS[x].test(label));
    if (k) {
      flush();
      key = k; idx = k === 'alt' ? Number((label.match(/(\d+)$/) || [])[1] || 0) || null : null;
      if (k === 'alt' && !idx) idx = (out.alt ? out.alt.filter(Boolean).length : 0) + 1;
      buf = [m[2].replace(/\*+$/, '')];
    } else if (key) buf.push(raw);
  }
  flush();
  if (out.hashtags) out.hashtags = (out.hashtags.match(/#[\p{L}\p{N}_]+/gu) || []).join(' ');
  if (out.ytTags) out.ytTags = out.ytTags.replace(/\n/g, ', ').replace(/#/g, '').replace(/\s*,\s*/g, ', ').replace(/^,\s*|,\s*$/g, '');
  if (!Object.keys(out).length && text && text.trim()) out.caption = text.trim(); // plain answer → use as caption
  return out;
}

export function createChatGPT(ctx) {
  const { S } = ctx;
  const st = { preset: 'all', prompt: '', reply: '', parsed: null, pick: {}, comment: null, view: null, attach: false, snaps: true };

  function brand() {
    const b = (S.settings.brandVoice || '').trim();
    return b || 'Acme Studio — a sample retail brand. Friendly, confident, premium tone; short sentences; light emoji; plain English.';
  }

  const snapsOn = () => st.snaps && ctx.clips && ctx.clips.hasScenes() && ctx.clips.count() > 0;
  function buildPrompt(preset) {
    const d = S.draft;
    const starter = () => { const t = ctx.brief && d.brief && d.brief.product ? starterTags(d.brief, S.settings.defaultHashtags) : []; return t.length ? ` Good starting tags: ${t.join(' ')}.` : ''; };
    const on = PLATFORMS.filter((p) => S.on[p]);
    const imgs = d.media.filter((m) => m.type === 'image');
    const vids = d.media.filter((m) => m.type === 'video');
    const ctxLines = [
      `Brand: ${brand()}`,
      `Platforms: ${on.map((p) => P[p].name).join(', ') || 'Instagram, Facebook'}`,
      `Media: ${d.media.length ? `${imgs.length} photo(s), ${vids.length} video(s)` : 'none yet'}${imgs.length && !st.attach ? ' (no image attached — base alt text on the caption)' : ''}`,
      ...(ctx.brief ? ctx.brief.lines() : []),
      d.media.length ? `Attached file name(s): ${d.media.map((m) => m.name).join(', ')}` : null,
      vids.length && ctx.clips && ctx.clips.summary() ? `Video structure: ${ctx.clips.summary()} ${snapsOn() ? (DESKTOP ? `The ${ctx.clips.count()} scene snapshot(s) (scene ${ctx.clips.nums().join(', ')}) are attached as numbered images — look at them and write the caption and hashtags from what is actually shown.` : `A picture with the ${ctx.clips.count()} numbered scene snapshot(s) (scene ${ctx.clips.nums().join(', ')}) is attached — look at it and write the caption and hashtags from what is actually shown.`) : '(timestamps only — no pictures are attached.)'}` : null,
      `Draft caption:\n"""\n${d.caption.trim() || '(empty — write one from the product details above)'}\n"""`,
      d.hashtags.trim() ? `Current hashtags: ${d.hashtags.trim()}` : null,
      (S.settings.defaultHashtags || '').trim() ? `Always include: ${S.settings.defaultHashtags.trim()}` : null,
    ].filter(Boolean).join('\n');
    const fmt = (labels) => `\n\nReply ONLY in this exact format, each label on its own line, no other commentary:\n${labels.join('\n')}`;
    const altLabels = imgs.length > 1 ? imgs.map((_, i) => `ALT TEXT ${i + 1}: <one sentence describing photo ${i + 1}>`) : ['ALT TEXT: <one sentence describing the photo>'];
    switch (preset) {
      case 'caption': return `Improve this social media caption so it gets more engagement. Keep the facts, add a hook in the first line and a clear call to action.\n\n${ctxLines}${fmt(['CAPTION: <the improved caption, no hashtags>'])}`;
      case 'hashtags': return `Suggest 12–18 relevant hashtags for this post (mix of broad, niche and local tags; Instagram allows 30 max). Base them on the caption, the product${vids.length ? ' and the video scenes' : ''}.${starter()}\n\n${ctxLines}${fmt(['HASHTAGS: #tag1 #tag2 …'])}`;
      case 'alt': return `Write accessible alt text for ${imgs.length > 1 ? 'each photo' : 'the photo'} in this post (what is visible, product names, under 125 characters each).\n\n${ctxLines}${fmt(altLabels)}`;
      case 'youtube': return `Write YouTube metadata for this video: a searchable title (max 100 characters, no clickbait), a description (first 2 lines matter most) and 15 tags.\n\n${ctxLines}${fmt(['YOUTUBE TITLE: <title>', 'YOUTUBE DESCRIPTION: <description>', 'YOUTUBE TAGS: tag one, tag two, …'])}`;
      case 'comment': return `Write a short first comment to post under this post (adds a link, question or extra hashtags to spark replies).\n\n${ctxLines}${fmt(['FIRST COMMENT: <comment>'])}`;
      case 'platforms': return `Rewrite the caption for each platform's style: Instagram (emoji, line breaks), Facebook (conversational), TikTok (short, punchy, trend-aware) and LinkedIn (professional, value-focused, 3 hashtags max).\n\n${ctxLines}${fmt(['INSTAGRAM CAPTION: <text>', 'FACEBOOK CAPTION: <text>', 'TIKTOK CAPTION: <text>', 'LINKEDIN POST: <text>'])}`;
      case 'reply': {
        const c = st.comment;
        if (!c) return 'Select a comment in the Comments card first (✨ Draft reply).';
        return `Write a reply from ${brand().split('—')[0].trim()} to this ${P[c.platform].name} comment. Be warm, helpful and brief (1–2 sentences); if they ask about price or stock, invite them to DM or visit example.com. Reply in the same language as the comment.\n\nOur post: "${(c.post && (c.post.title || c.post.text) || '').slice(0, 300)}"\nComment from ${c.author}: "${c.text}"${fmt(['REPLY: <the reply>'])}`;
      }
      default: {
        const labels = ['CAPTION: <caption, no hashtags>', 'HASHTAGS: #tag1 #tag2 … (12–18 tags, based on the caption, the product and the video scenes)'];
        if (imgs.length) labels.push(...altLabels);
        if (S.on.yt && vids.length) labels.push('YOUTUBE TITLE: <max 100 characters>', 'YOUTUBE TAGS: tag one, tag two, …');
        labels.push('FIRST COMMENT: <short comment to post under it>');
        return `You are a social media manager. ${d.caption.trim() ? 'Improve' : 'Write'} the caption for this post so it gets reach and engagement: hook in the first line, clear call to action, platform-friendly length. Describe only what the product details and video structure support — do not invent specs or prices.${starter()}\n\n${ctxLines}${fmt(labels)}`;
      }
    }
  }

  const PRESETS = [['all', '✨ Everything'], ['caption', 'Caption'], ['hashtags', 'Hashtags'], ['alt', 'Alt text'], ['youtube', 'YouTube title & tags'], ['platforms', 'Per-platform captions'], ['comment', 'First comment'], ['reply', 'Comment reply']];

  // ── Windows app: drive the real ChatGPT page inside the <webview>
  let wv = null;
  function webview() {
    if (wv) return wv;
    wv = document.createElement('webview');
    wv.setAttribute('src', ctx.gptChatUrl || 'https://chatgpt.com/');
    wv.setAttribute('partition', 'persist:chatgpt');
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('useragent', DESKTOP.userAgent || navigator.userAgent.replace(/ Electron\/\S+| social-radar\/\S+/gi, ''));
    wv.className = 'gpt-view';
    // Moving the card (float/dock) re-attaches the view; reopen the conversation you were in, not a blank chat.
    let reattached = false;
    wv.addEventListener('did-navigate', (e) => { st.url = e.url; });
    wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame !== false) st.url = e.url; });
    wv.addEventListener('dom-ready', () => { if (reattached && st.url && wv.getURL() !== st.url) wv.loadURL(st.url); reattached = true; });
    return wv;
  }
  const INJECT = `(async (text) => {
    const box = document.querySelector('#prompt-textarea, div[contenteditable="true"].ProseMirror, textarea[name="prompt-textarea"], textarea');
    if (!box) return 'no-box';
    box.focus();
    if (box.tagName === 'TEXTAREA') { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(box, text); box.dispatchEvent(new Event('input', { bubbles: true })); }
    else { document.execCommand('selectAll', false, null); document.execCommand('insertText', false, text); }
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const b = document.querySelector('button[data-testid="send-button"], button[aria-label="Send prompt"], #composer-submit-button');
      if (b && !b.disabled) { b.click(); return 'sent'; }
    }
    return 'typed';
  })`;
  const GRAB = `(() => {
    const busy = !!document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="Stop generating"]');
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    const last = msgs[msgs.length - 1];
    return { busy, text: last ? last.innerText : '' };
  })()`;
  async function sendToWebview() {
    const v = webview();
    try {
      if (snapsOn() && DESKTOP.copyImage) {
        const shots = await ctx.clips.snapshots();
        for (const sh of shots) {
          await DESKTOP.copyImage(sh.dataUrl);
          await v.executeJavaScript(`(document.querySelector('#prompt-textarea, div[contenteditable="true"]')||{focus(){}}).focus()`);
          v.paste();
          await new Promise((r) => setTimeout(r, 1100));
        }
        if (shots.length) await new Promise((r) => setTimeout(r, 1500)); // let ChatGPT finish uploading
      }
      if (st.attach) {
        const img = S.draft.media.find((m) => m.type === 'image');
        if (img && DESKTOP.copyImage) {
          const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(img.file); });
          await DESKTOP.copyImage(dataUrl);
          await v.executeJavaScript(`(document.querySelector('#prompt-textarea, div[contenteditable="true"]')||{focus(){}}).focus()`);
          v.paste();
          await new Promise((r) => setTimeout(r, 1800)); // let ChatGPT upload the image
        }
      }
      const r = await v.executeJavaScript(INJECT + '(' + JSON.stringify(st.prompt) + ')');
      if (r === 'no-box') toast('Sign in to ChatGPT inside the card first.', 'err');
      else if (r === 'typed') toast('Prompt typed — press Enter in ChatGPT to send.');
      else { toast('Sent to ChatGPT. Press "Use reply" when it has answered.'); watchReply(); }
    } catch (e) { toast('Couldn\'t type into ChatGPT: ' + e.message, 'err'); }
  }
  let watchT = null;
  function watchReply() {
    clearInterval(watchT);
    let n = 0;
    watchT = setInterval(async () => {
      if (++n > 120) return clearInterval(watchT);
      try {
        const r = await webview().executeJavaScript(GRAB);
        const btn = $('#gptUse');
        if (btn) btn.classList.toggle('pulse', !r.busy && !!r.text);
        if (!r.busy && r.text && n > 2) clearInterval(watchT);
      } catch { /* page reloading */ }
    }, 1500);
  }
  async function grabFromWebview() {
    try {
      const r = await webview().executeJavaScript(GRAB);
      if (r.busy) return toast('ChatGPT is still writing — try again in a moment.');
      if (!r.text) return toast('No ChatGPT answer found on the page yet.', 'err');
      useReply(r.text);
    } catch (e) { toast('Couldn\'t read ChatGPT\'s answer: ' + e.message, 'err'); }
  }

  // ── shared
  function useReply(text) {
    st.reply = text;
    st.parsed = parseReply(text);
    st.pick = Object.fromEntries(Object.keys(st.parsed).map((k) => [k, true]));
    render();
  }
  function apply() {
    const p = st.parsed; if (!p) return;
    const f = {};
    for (const [k, v] of Object.entries(p)) if (st.pick[k]) f[k] = v;
    if (f.reply && st.comment) { ctx.useReply(st.comment, f.reply); delete f.reply; }
    if (Object.keys(f).length) ctx.composer.applyFields(f);
    toast('Applied to the composer ✓');
    st.parsed = null; st.reply = ''; render();
  }
  async function open(preset, comment) {
    if (!comment && ctx.brief && !(await ctx.brief.ensure(preset || 'all'))) return;
    st.preset = preset || 'all';
    if (comment) st.comment = comment;
    st.prompt = buildPrompt(st.preset); st.edited = false;
    st.parsed = null;
    ctx.focusCard('chatgpt');
    render();
    if (DESKTOP && st.prompt && ctx.autoSend) sendToWebview();
  }
  function openInBrowser() {
    const chat = ctx.gptChatUrl;
    const snaps = snapsOn();
    if (snaps) {
      // the prompt travels in the link, so the clipboard is free for the scene snapshots
      const u = 'https://chatgpt.com/?q=' + encodeURIComponent(st.prompt);
      const inLink = !chat && u.length < 7500;
      const pic = ctx.clips.copySheetNow();                        // start the copy first, while this tab is still focused
      if (!inLink) copyText(st.prompt);
      const target = chat || (inLink ? u : 'https://chatgpt.com/');
      const w = window.open(target, touchDevice() ? '_blank' : 'chatgpt', touchDevice() ? undefined : 'popup=yes,width=760,height=900');
      if (!w) location.href = target;
      pic.then((ok) => toast(ok ? (inLink ? 'ChatGPT opened with your prompt. Press Ctrl+V in the chat box to attach the scene snapshots, then send.' : 'Prompt copied — paste it into ChatGPT, then press “Copy snapshots” and paste again.') : 'Couldn\'t copy the snapshots — press “Copy snapshots” below.', ok ? undefined : 'err'));
      return;
    }
    if (chat) {
      copyText(st.prompt);
      if (!window.open(chat, touchDevice() ? '_blank' : 'chatgpt', touchDevice() ? undefined : 'popup=yes,width=760,height=900')) location.href = chat;
      return toast('Your chat opened and the prompt is copied. Paste it there, then copy the answer and paste it below.');
    }
    const u = 'https://chatgpt.com/?q=' + encodeURIComponent(st.prompt);
    copyText(st.prompt);
    const w = window.open(u.length < 7500 ? u : 'https://chatgpt.com/', touchDevice() ? '_blank' : 'chatgpt', touchDevice() ? undefined : 'popup=yes,width=760,height=900');
    if (!w) location.href = u;
    toast(u.length < 7500 ? 'ChatGPT opened with your prompt. Copy its answer and paste it below.' : 'Prompt copied — paste it into ChatGPT.');
  }

  const LBL = { caption: 'Caption', hashtags: 'Hashtags', alt: 'Alt text', ytTitle: 'YouTube title', ytTags: 'YouTube tags', ytDesc: 'YouTube description', firstComment: 'First comment', reply: 'Reply', custom_ig: 'Instagram caption', custom_fb: 'Facebook caption', custom_tt: 'TikTok caption', custom_li: 'LinkedIn post' };
  function parsedView() {
    const p = st.parsed;
    return h('div', { class: 'gpt-parsed' },
      h('div', { class: 'sec-label' }, 'From ChatGPT — tick what to use'),
      Object.entries(p).map(([k, v]) => h('label', { class: 'gp-row' },
        h('input', { type: 'checkbox', checked: st.pick[k], onchange: (e) => { st.pick[k] = e.target.checked; } }),
        h('div', {}, h('b', {}, LBL[k] || k), h('div', { class: 'gp-val' }, Array.isArray(v) ? v.map((x, i) => x ? h('div', {}, `${i + 1}. ${x}`) : null) : v)))),
      h('div', { class: 'row' }, h('button', { class: 'btn primary sm', onclick: apply }, 'Apply to post'), h('button', { class: 'btn ghost sm', onclick: () => { st.parsed = null; render(); } }, 'Discard')));
  }

  const snapTog = () => h('label', { class: 'tog', title: 'Send a snapshot of every scene so ChatGPT can see the video' }, h('input', { type: 'checkbox', checked: st.snaps, onchange: (e) => { st.snaps = e.target.checked; st.prompt = buildPrompt(st.preset); render(); } }), `Scene snapshots (${ctx.clips.count()} selected)`);

  function render() {
    const c = ctx.cards.chatgpt;
    if (!c) return;
    if (!st.prompt) st.prompt = buildPrompt(st.preset);
    const ta = h('textarea', { class: 'inp gpt-prompt', rows: DESKTOP ? 4 : 7, value: st.prompt, 'aria-label': 'Prompt' });
    ta.addEventListener('input', () => { st.prompt = ta.value; st.edited = true; });
    const presets = h('div', { class: 'gpt-presets' }, PRESETS.map(([k, l]) => h('button', { class: 'chip' + (st.preset === k ? ' on' : ''), disabled: k === 'reply' && !st.comment, title: k === 'reply' && !st.comment ? 'Use ✨ Draft reply on a comment first' : null, onclick: () => { st.preset = k; st.prompt = buildPrompt(k); render(); } }, l)));
    const hasImg = S.draft.media.some((m) => m.type === 'image');
    const top = [presets, ta,
      DESKTOP
        ? h('div', { class: 'row' },
          ctx.clips && ctx.clips.hasScenes() && DESKTOP.copyImage ? snapTog() : null,
          hasImg && DESKTOP.copyImage ? h('label', { class: 'tog', title: 'Paste the first photo into ChatGPT so it can see it (for alt text)' }, h('input', { type: 'checkbox', checked: st.attach, onchange: (e) => { st.attach = e.target.checked; st.prompt = buildPrompt(st.preset); render(); } }), 'Attach photo') : null,
          h('span', { class: 'grow' }),
          h('button', { class: 'btn sm', onclick: () => { st.prompt = buildPrompt(st.preset); render(); } }, 'Rebuild'),
          h('button', { class: 'btn sm primary', onclick: sendToWebview }, 'Send to ChatGPT'),
          h('button', { id: 'gptUse', class: 'btn sm light', onclick: grabFromWebview }, 'Use reply'))
        : h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => { copyText(st.prompt); toast('Prompt copied'); } }, 'Copy'),
          ctx.clips && ctx.clips.hasScenes() ? snapTog() : null,
          ctx.clips && ctx.clips.hasScenes() ? h('button', { class: 'btn sm', title: 'Copies one picture with the ticked scene snapshots — paste it into ChatGPT', onclick: () => ctx.clips.copySheet() }, 'Copy snapshots') : null,
          h('span', { class: 'grow' }),
          h('button', { class: 'btn sm primary', onclick: openInBrowser }, h('span', { svg: I.gpt }), 'Open in ChatGPT')),
      st.parsed ? parsedView() : null];
    if (!st.topEl) st.topEl = h('div', { class: 'gpt-top' });
    fill(st.topEl, ...top.filter(Boolean));
    if (DESKTOP) {
      if (!st.hostEl) st.hostEl = h('div', { class: 'gpt-host' }, webview());
      if (st.topEl.parentNode !== c.body || st.hostEl.parentNode !== c.body) fill(c.body, st.topEl, st.hostEl);
    } else {
      const paste = h('textarea', { class: 'inp', rows: 6, placeholder: 'Paste ChatGPT\'s answer here…', value: st.reply });
      paste.addEventListener('input', () => { st.reply = paste.value; });
      fill(c.body, st.topEl, h('div', { class: 'gpt-paste' },
        h('div', { class: 'sec-label' }, 'ChatGPT\'s answer'),
        paste,
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: async () => { try { const t = await navigator.clipboard.readText(); if (!t) throw new Error('empty'); paste.value = t; st.reply = t; useReply(t); } catch { toast('Couldn\'t read the clipboard — paste with Ctrl+V / long-press instead.', 'err'); } } }, 'Paste from clipboard'),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn sm primary', onclick: () => { if (!st.reply.trim()) return toast('Paste ChatGPT\'s answer first.', 'err'); useReply(st.reply); } }, 'Read answer')),
        h('p', { class: 'xs muted' }, 'ChatGPT can\'t be shown inside a web page, so it opens in its own tab. Paste the reply back and it fills everything in for you.')));
    }
    c.el.classList.toggle('gpt-desktop', !!DESKTOP);
  }

  // called when the ticked clips change: refresh the prompt unless you have been editing it by hand
  const touch = () => { if (st.prompt && !st.edited) st.prompt = buildPrompt(st.preset); render(); };
  return { render, open, touch, buildPrompt, parseReply, refresh: () => { st.prompt = buildPrompt(st.preset); if (DESKTOP && wv && ctx.gptChatUrl && st.lastChat !== ctx.gptChatUrl) { st.lastChat = ctx.gptChatUrl; try { wv.loadURL(ctx.gptChatUrl); } catch { /* not ready yet */ } } render(); } };
}
