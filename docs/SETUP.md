# Social Radar — setup guide (showcase edition)

A social media console: one composer, one **Submit**, posts to five
platforms at once — with a real ChatGPT panel to polish the words before you send.

| Card | What it does |
|---|---|
| **Composer** (center) | Add photos/video, write one caption, pick which of the 5 platforms to post to, fine-tune each one on its own tab (crop, privacy, first comment, YouTube title/tags…), hit **Submit**. Live checklist catches problems before you post. |
| **ChatGPT** (left) | A prompt builder for caption / hashtags / alt text / YouTube title & tags / first comment / a reply to a comment — pre-filled with your brand voice from Settings. On the web it opens chatgpt.com in a new tab and you paste the answer back; the **Windows desktop app** docks the real chatgpt.com inside this card, signed in as you, so nothing leaves the window. |
| **Recent posts** (right) | Every post on every connected account, with views/likes/comments/shares and an engagement %, newest first, filterable by platform. |
| **Comments** | Reads comments on your recent posts, reply or hide, with a "Draft with ChatGPT" shortcut. |
| **Stories** | A canvas editor (drag text, emoji, links) for Instagram/Facebook Stories. Posts directly where the API allows it, or hosts the finished image/video and hands it to your **phone** (a link + QR code) for the things only the phone app can do — stickers, music, swipe-up links on accounts without the API feature. |
| **Summary tiles** | Followers and 28-day views/engagement per platform, at the top of the page. |

Everything is stored in your browser (and synced across your devices through your own Google Drive, as a dashboard pattern) — nothing is stored on the server.

---

## Why "hybrid," and what each platform can and can't do

Every platform's official API has gaps a phone app doesn't have. Social Radar uses the real API wherever it
works, and is honest about the rest instead of pretending:

- **Instagram & Facebook** — full posting (feed, carousel, Reels, Stories), full analytics, comment moderation, all from the browser. Instagram Stories posted via the API can carry a **link sticker**, but not polls, music or other interactive stickers — the API doesn't expose those. For a sticker-heavy Story, use **Send to phone** in the Stories card.
- **YouTube** — full upload with title, description, tags and thumbnail, direct from the browser. Google forces videos **private** from any app that hasn't passed their API compliance audit (a review Google runs once you're sending real traffic) — until then, switch it to Public yourself in YouTube Studio or your app settings after upload. This is a Google rule for every third-party app, not a bug here.
- **TikTok** — full upload including captions and privacy, direct API. The same rule applies: an unaudited app can only post as **Private** (visible to you only) until TikTok approves your app for public posting, so Social Radar forces that setting and tells you so. **"Send to TikTok inbox"** is the workaround that works from day one — TikTok drafts it in your phone's inbox and you tap **Post** there, which carries no restriction.
- **LinkedIn** — full posting (text, images, video, link) and comments, as yourself or as the Acme Studio Page. Analytics needs the Community Management API, a separate approval LinkedIn grants per-app (see below).
- **Stories without API coverage** (interactive stickers, music, some swipe-up links) — handled by **Send to phone**: the app hosts your finished image/video and queues it; open the link on your phone (or scan the QR code shown), and your phone's share sheet does the rest in a few taps.

None of this needs a paid third-party service — it's your own developer apps talking directly to each platform.

---

## 1 · Deploy to Vercel (~5 minutes)

1. Create a GitHub repo and push this folder, or from this folder run `npx vercel` and follow the prompts.
2. In Vercel: **Add New → Project**, import the repo, keep **Framework preset: Other**. Nothing needs building — the one build step (bundling the Vercel Blob upload helper) already ran and is committed in `public/vendor/`.
3. **Storage → Create Database → Blob** (used to host your photos/videos at a URL the platforms can fetch). Copy the `BLOB_READ_WRITE_TOKEN` it gives you.
4. Under **Settings → Environment Variables**, add what you have from the table below, then redeploy. You can add platforms one at a time — Accounts shows which are ready.

To try the whole app before connecting anything real, open your URL with `?demo=1`. Demo mode fakes every post and every number; nothing real is ever sent, and it keeps separate data from your real account.

| Variable | Platform | Where to get it |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | All (media hosting) | Step 3 above |
| `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` | Instagram + Facebook | §2 below |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok | §3 below |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn | §4 below |
| `GOOGLE_CLIENT_ID` | YouTube + sign-in | §5 below |
| `APP_PASSCODE` | Recommended | Any password you pick — the app asks for it once so nobody else can post from your URL |

A full list with comments is in `.env.example`.

## 2 · Instagram & Facebook: a Meta app (~15 minutes, needs a Acme Studio Page)

1. First, make sure the **Instagram account is a Professional account linked to the Acme Studio Facebook Page** (Page → Settings → Linked accounts → Instagram, or do it from the Instagram app: Settings → Account type → Professional, then connect to the Page). This is Meta's own requirement — personal Instagram accounts can't use the API at all.
2. Go to **developers.facebook.com → My Apps → Create App**, type **Business**, name it "Social Radar" (or similar).
3. Add the **Facebook Login for Business** product.
4. Under **Facebook Login for Business → Configurations**, create a configuration with these permissions (this app requests exactly these, nothing more): `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `read_insights`, `business_management`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`. Copy the **Configuration ID** → `META_CONFIG_ID`.
5. Under **App Settings → Basic**: copy the **App ID** → `META_APP_ID` and **App Secret** → `META_APP_SECRET`. Add your Vercel domain under **App Domains**, and under **Website** add your Vercel URL as the Site URL. No OAuth Redirect URI needed — this app signs in with Facebook's own JS SDK popup, not a redirect.
7. While the app is in **Development mode**, only people added under **App Roles → Roles** (as Admin, Developer or Tester) can connect it. Add every Acme Studio teammate who'll use Social Radar there with their Facebook login. Going live for the public needs Meta's **App Review** (only relevant if you ever open this up beyond your own team).
8. In Social Radar, open **Accounts → Connect with Facebook**, log in, and approve the permissions. Pick the Acme Studio Page; its linked Instagram account comes with it automatically.

## 3 · TikTok: a developer app (~10 minutes)

1. Go to **developers.tiktok.com → Manage apps → Create an app**.
2. Add the **Login Kit** and **Content Posting API** products.
3. Under **Login Kit → Settings**, add your Vercel URL's callback as a **Redirect URI**: `https://YOUR-DOMAIN/api/tiktok-callback`.
4. Copy the **Client key** → `TIKTOK_CLIENT_KEY` and **Client secret** → `TIKTOK_CLIENT_SECRET`.
5. Request the scopes `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.publish`, `video.upload` under **Content Posting API → Scopes** (these are requested automatically when you connect).
6. **Add your TikTok account(s)** under **Target users** / sandbox testers while the app is unaudited — only those accounts can connect. TikTok's own review (for public posting instead of private-only, and to add more accounts) is a form in the same dashboard; approval is usually a few business days.
7. In Social Radar, **Accounts → Connect TikTok**. Until the app is audited, posts go out as Private, or use **Send to TikTok inbox** to post normally that same day (see above).

## 4 · LinkedIn: a developer app (~10 minutes, needs a Acme Studio Page admin)

1. Go to **developer.linkedin.com → My apps → Create app**, link it to the **Acme Studio Company Page** (you need to be a Page admin).
2. Under **Products**, request **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** (both auto-approve). If you want posting *as the Company Page* and its analytics (not just as yourself), also request **Community Management API** — this one needs LinkedIn's review; until it's approved, set `LINKEDIN_ORG=0` and the app posts as your own profile.
3. Under **Auth**, add this **Redirect URL** (exactly, no trailing slash): `https://YOUR-DOMAIN/api/linkedin-callback`. Copy the **Client ID** → `LINKEDIN_CLIENT_ID` and **Client Secret** → `LINKEDIN_CLIENT_SECRET`.
4. Once Community Management API is approved, set `LINKEDIN_ORG=1` and redeploy — Accounts will then offer the Acme Studio Page (not just your profile) as a posting target, with its own follower/engagement stats.
   LinkedIn won't let one app hold the Community Management API plus other products, so use two apps: a personal one (`LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`) and a Pages one (`LINKEDIN_PAGES_CLIENT_ID` / `LINKEDIN_PAGES_CLIENT_SECRET`). Both use the same redirect URL. Accounts then shows **Connect LinkedIn (you)** and **Connect Acme Studio Page**.
5. In Social Radar, **Accounts → Connect LinkedIn**.

## 5 · YouTube + Google sign-in (~5 minutes)

1. Go to **console.cloud.google.com**, create a project ("Social Radar").
2. **APIs & Services → Library**: enable **YouTube Data API v3**.
3. **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name and your e-mail. Under **Scopes**, add `youtube.upload`, `youtube.force-ssl` and `yt-analytics.readonly`. Under **Test users**, add every Acme Studio Gmail/Google account that'll post — while the app is in **Testing**, only those can sign in (up to 100), and that's fine for internal use.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Under **Authorized JavaScript origins**, add your Vercel URL and `http://localhost:3000` if you'll run it locally. No redirect URI needed.
5. Copy the **Client ID** → `GOOGLE_CLIENT_ID`.
6. In Social Radar, click **Sign in with Google** (top of the page) and allow the YouTube permissions. The same Google sign-in also turns on cross-device sync via Drive (a private app-data file only Social Radar can see).

New videos upload as **Private** until your app passes Google's API compliance audit (same rule as everyone's third-party uploader) — flip them to Public in YouTube Studio, or request the audit once you're posting for real.

---

## 6 · The ChatGPT card

**On the web app**, tapping a preset (Caption, Hashtags, Alt text…) builds a prompt from your draft + your
brand voice (set it in Settings), opens **chatgpt.com** in a new tab with it pre-filled, and gives you a
"paste the reply here" box that reads it straight into your caption/hashtag/alt-text fields.

(The original project also had a Windows desktop shell that docked chatgpt.com inside the card; it is left out of this showcase.)

---

## 7 · Run locally (optional, for testing changes)

```bash
cp .env.example .env     # fill in whatever keys you have
npm install
node server.js           # http://localhost:3000
# or, with no keys at all:
npm run demo              # http://localhost:3000/?demo=1
```

If you change anything that touches Vercel Blob uploads, rebuild the bundled browser client:
`npm run build:vendor` (needs `esbuild`, already a dev dependency).

---

## Notes and limits

- **Privacy:** your draft, accounts list, posts log and settings live in your browser (localStorage) and, once you sign in with Google, in a private app-data file in your own Drive — never on the server. OAuth tokens for TikTok/LinkedIn are relayed through the server (required by those APIs) but never stored there.
- **Media hosting:** each Submit uploads your photo/video once to Vercel Blob so every platform's API can fetch it from a public URL (all five require this — none accept a raw file upload from a browser except YouTube and TikTok, which this app does directly). Once every target platform confirms the post, the hosted copy is deleted automatically.
- **Caption limits** differ per platform (shown live as you type: Instagram 2,200, Facebook 63,206, YouTube description 5,000, TikTok 2,200, LinkedIn 3,000) — the checklist warns before you hit Submit, it doesn't silently truncate.
- **Instagram aspect ratio:** Instagram only accepts photos between 0.8 and 1.91 (roughly 4:5 to 1.91:1). A photo outside that range is automatically padded with a blurred version of itself rather than rejected or stretched.
- **TikTok and YouTube "unaudited" limits** are explained in full under "Why hybrid" above — they're the platforms' own rules for any new third-party app, not something this app can bypass, and they lift once you request and pass each platform's review.
- **Passcode:** set `APP_PASSCODE` and the app asks for it once (gear icon → Settings) before anyone can use your API keys from your URL.

## Files

```
api/config.js          Which keys are configured (never the keys themselves)
api/blob.js             Upload/delete media via Vercel Blob
api/meta.js              Instagram + Facebook: token exchange, Pages, Reels/Story uploads
api/tiktok.js            TikTok: OAuth, chunked video upload, publish, stats
api/tiktok-callback.js   TikTok OAuth redirect handler
api/linkedin.js          LinkedIn: OAuth, posts, comments, stats
api/linkedin-callback.js LinkedIn OAuth redirect handler
lib/util.js              Shared server helpers
public/                  The app: index.html, app.js, composer.js, platforms.js, chatgpt.js, stories.js, core.js, google.js, sync.js, styles.css
server.js                Local runner
```

## Inbox (Instagram DMs + Messenger)

Normal connecting does **not** ask for messaging permissions. To read/reply to messages:
1. developers.facebook.com → your app → **Use cases** → add **"Engage with customers on Messenger from Meta"** and **"Manage messaging & content on Instagram"**; under each, **Customize** and add `pages_messaging` / `instagram_manage_messages`.
2. In Social Radar's Inbox card press **Allow messages (reconnect Facebook)** and tick Acme Studio + its Instagram.
3. Instagram app: Settings → Messages and story replies → Message controls → allow access to messages.

- **Deleted in Meta** — the Inbox remembers recent chats in this browser and labels messages/chats that later vanish from Meta (cannot say who deleted them).
