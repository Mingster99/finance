# Finance Dashboard

Read-only personal finance dashboard. Reads a private Google Sheet through a
service account and renders it as an installable iOS PWA. No database, no
backend, no write path.

## What's here

```
auth.js                     Auth.js config — Google provider + email allowlist
middleware.js               Guards /dashboard
app/page.js                 Sign-in gate (blank until authenticated)
app/dashboard/page.js       Protected shell
app/dashboard/Dashboard.js  The dashboard UI
app/api/data/route.js       Session-gated sheet read
lib/sheets.js               Sheets API client + type coercion
lib/aggregate.js            Net worth, cash flow, categories, duplicates
public/manifest.json        PWA manifest
```

---

## Setup

### 1. Google Cloud — service account (sheet access)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project
2. APIs & Services → Library → enable **Google Sheets API**
3. APIs & Services → Credentials → Create credentials → **Service account**
4. Name it anything, skip the optional role step, click Done
5. Click the service account → Keys → Add key → Create new key → **JSON**
6. A `.json` file downloads. Base64-encode it:

```bash
base64 -i ~/Downloads/your-key.json | tr -d '\n' | pbcopy
```

7. Open your Google Sheet → Share → paste the service account email
   (`something@project.iam.gserviceaccount.com`) → set to **Viewer** → Send

Viewer, not Editor. The app never writes, so nothing should be able to.

### 2. Google Cloud — OAuth client (sign-in)

1. Same project → APIs & Services → OAuth consent screen → External →
   fill in the required fields → add your own email as a test user
2. Credentials → Create credentials → **OAuth client ID** → Web application
3. Authorised redirect URIs — add both:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR-APP.vercel.app/api/auth/callback/google`
4. Copy the client ID and secret

You can add the Vercel URL after your first deploy — just remember to come
back and do it, or sign-in will fail in production.

### 3. Environment variables

```bash
cp .env.example .env.local
npx auth secret        # writes AUTH_SECRET into .env.local
```

Fill in the rest:

| Variable | Where it comes from |
|---|---|
| `AUTH_SECRET` | `npx auth secret` |
| `AUTH_GOOGLE_ID` | OAuth client ID (step 2) |
| `AUTH_GOOGLE_SECRET` | OAuth client secret (step 2) |
| `ALLOWED_EMAILS` | Your Google address. Comma-separated for more than one. |
| `SHEET_ID` | The long ID in your sheet URL between `/d/` and `/edit` |
| `GOOGLE_SERVICE_ACCOUNT_KEY_B64` | Base64 blob from step 1 |

### 4. Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. You should see only a sign-in button. After
signing in you land on the dashboard.

**Test the allowlist before deploying:** sign out, then try signing in with a
different Google account. It must be rejected.

---

## Deploy

```bash
git init
git add .
git commit -m "Finance dashboard foundation"
gh repo create finance-dashboard --private --source=. --push
```

Then on [vercel.com](https://vercel.com): New Project → import the repo →
add all six environment variables → Deploy.

After the first deploy, go back to the Google OAuth client and add your real
Vercel URL as a redirect URI.

---

## Install on your phone

Open the Vercel URL in **Safari** (not Chrome — iOS only installs PWAs from
Safari), sign in, then Share → Add to Home Screen.

Before doing this, add `icon-192.png` and `icon-512.png` to `/public`.
Without them the home screen icon falls back to a screenshot.

---

## How the numbers work

Two rules govern everything in `lib/aggregate.js`:

**Spending only counts `type = "expense"` and `type = "fee"`.** Transfers,
credit card payments and CPF contributions move money between accounts you
own — they are real balance movements but they are not spending. Refunds are
netted off their own category, so category totals always sum to the same
figure as the headline "Out" number.

**Net worth carries balances forward.** If an account has no balance row for
a given month, the last known figure is reused rather than treated as zero.
Forgetting to log an investment balance shows a warning banner instead of
silently wiping thousands off your net worth.

Duplicate `txn_id` values are counted and surfaced, never auto-removed —
they inflate your totals until you delete the extra rows from the sheet,
which is the correct behaviour for a data-entry mistake.

---

## Next steps

Screens from the PRD not yet built: the Cash Flow bar chart, the Categories
donut with drill-down, the Net Worth stacked area chart, and the Review
screen for low-confidence rows. `lib/aggregate.js` already returns the data
each of these needs.

Also pending: service worker for offline caching, app icons, and the
add-to-home-screen hint banner.
