# ULDP 2026 Portal — Hostinger Deployment Guide
*For non-developers. ~30 minutes end to end.*

## 1 · Create the subdomain
1. Log in to **hPanel** → Websites → your domain → **Subdomains**.
2. Create `portal` (→ `portal.yourdomain.com`). Hostinger creates a folder like `domains/yourdomain.com/public_html/portal` (this is your **document root**).

## 2 · Upload the site (two ways)
**A — hPanel File Manager (easiest).** hPanel → Files → File Manager → navigate to the subdomain's document root → Upload → drag the **contents** of `uldp2026-portal/` (not the folder itself) so `index.html` sits directly in the root. The hidden `.htaccess` must come too — enable "show hidden files" to confirm it landed.

**B — FTP (better for repeat updates).** hPanel → Files → FTP Accounts → note host/user/pass (port 21). In FileZilla/Cyberduck connect and mirror `uldp2026-portal/` → document root. Subsequent updates: just re-upload changed files.

## 3 · SSL (free)
hPanel → Security → **SSL** → install the free Let's Encrypt certificate for `portal.yourdomain.com`. The included `.htaccess` already forces HTTPS once the cert is live.

## 4 · Connect the data (one-time)
1. Build the **Points Claim Google Form** (House/Individual branch) linked to the points Sheet — its responses tab will be named `Submissions` (rename it to exactly that if needed).
2. Sheet → Extensions → Apps Script → paste `apps-script/Code.gs`.
3. **Set the staff password:** Project Settings (gear) → *Script Properties* → add `STAFF_KEY` = a strong passphrase. This is the login for the approval console.
4. In the editor, pick `setup` in the function dropdown and press **▶ Run** once, granting permissions. This creates the `House_Standings`, `MVP`, `Catalog`, `ChangeLog` tabs and the workflow columns automatically.
5. **Deploy → New deployment → Web app** (Execute as *Me*, access *Anyone*) → copy the `/exec` URL.
6. Edit `assets/js/config.js` on the server:
   - `API_URL` = the `/exec` URL
   - `STAFF_CONSOLE_URL` = the same `/exec` URL **+ `?page=staff`**
   - `FORM_EMBED_URL` = Form → Send → `<>` embed → copy the iframe `src`
   - change `CAPTAIN_CODE` from the default
7. Share the **staff URL + `STAFF_KEY`** with the Game Master only. (A discreet "Staff" link also appears in the site footer once `STAFF_CONSOLE_URL` is set.)

### The staff approval console (what the Game Master gets)
Open the staff URL, enter the key, and you get four tabs:
- **Pending** — every unreviewed claim. Correct the House / category / points / member inline if needed, then **Approve** or **Reject** (with a reason). The leaderboard rebuilds instantly.
- **+ Add points** — log an approved entry by hand (no Form needed) — useful for live, on-the-spot awards.
- **Recent** — the last 40 reviewed decisions.
- **Standings** — the live rebuilt totals per House.

Approving/rejecting **never deletes** rows — it stamps Status/ReviewedBy/ReviewedAt/Reason on the `Submissions` row (full audit trail), then recomputes `House_Standings` + `MVP` from all approved rows.

## 5 · Gating the Captain page — what it is and isn't
The access code on `submit.html` is a **soft gate**: it keeps casual participants out, but it lives in client-side JS, so treat it as a speed bump, not security. The real protection is on the **Google Form itself**: in Form settings, restrict to signed-in Google accounts (and optionally collect emails), so even someone past the gate can't submit anonymously. Rotate the captain code if it leaks; `robots.txt` already excludes the page from search.

## 6 · Sanity checklist after deploy
- [ ] `https://portal.yourdomain.com` loads with the padlock; HTTP redirects to HTTPS
- [ ] All 7 pages load; nav + mobile hamburger work
- [ ] Clean URLs work (`/houses` opens houses.html)
- [ ] Leaderboard shows the placeholder before Reveal Day, live bars after (set by `LEADERBOARD_LIVE_FROM` in config.js)
- [ ] Captain code unlocks `submit.html` and the Form loads inside it
- [ ] A test Form submission → approve in Sheet → appears on the leaderboard within ~5 min
- [ ] Secrecy check: view-source on every public page — no activity names/codes anywhere

## 7 · When you'd outgrow this setup
You only need Hostinger's MySQL/PHP tier if you later want: real per-participant logins, private per-house dashboards, or write-operations from the site itself. For a read-only leaderboard + Google Form intake, the static + Apps Script stack is simpler, free, and has fewer things that can break mid-programme.
