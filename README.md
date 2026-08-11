# Vercel ARR Test Dashboard — daily 9am Google Sheet refresh

This project pulls the ARR bridge out of the **Vercel Test Dashboard** Google
Sheet once a day and renders it on a static-feeling dashboard page.

## How it works

- `api/refresh.js` — runs on a Vercel Cron schedule, authenticates to Google
  Sheets with a service account, reads the bridge values, and writes a JSON
  snapshot to **Vercel Blob**.
- `api/data.js` — the endpoint the dashboard calls on load. It reads the
  latest snapshot from Blob and returns it.
- `public/index.html` — the dashboard. Fetches `/api/data` on load; if that
  fails (e.g. before the first cron run) it falls back to a hardcoded
  last-known snapshot so the page never breaks.
- `vercel.json` — schedules `/api/refresh` to run at **09:00 UTC** daily.

## One-time setup

### 1. Create a Google service account
1. In Google Cloud Console, create (or reuse) a project and enable the
   **Google Sheets API**.
2. Create a service account, then create a JSON key for it and download it.
3. Note the service account's email address (looks like
   `something@project-id.iam.gserviceaccount.com`) and its private key.

### 2. Share the sheet with the service account
Open the **Vercel Test Dashboard** sheet → Share → add the service account's
email address as a **Viewer**. Without this step the API call will fail with
a permissions error.

### 3. Set environment variables in Vercel
In your Vercel project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the service account email |
| `GOOGLE_PRIVATE_KEY` | the private key from the JSON file, with real newlines converted to `\n` |
| `SHEET_ID` | the ID from the sheet's URL (`.../d/<THIS PART>/edit`) |
| `SHEET_RANGE` | optional, defaults to `Sheet1!B8:C16` — adjust to match where the label/value rows actually sit |
| `CRON_SECRET` | any random string — protects `/api/refresh` from being called by anyone else |

### 4. Enable Vercel Blob storage
In your Vercel project → Storage → Create → **Blob**. This automatically
sets the `BLOB_READ_WRITE_TOKEN` env var the code needs — no extra account
or sign-up required.

### 5. Deploy
Push this project to Vercel as normal (`vercel` CLI or connect the repo).
`vercel.json`'s `crons` block is picked up automatically on deploy.

### 6. Seed the first snapshot
The dashboard falls back to hardcoded data until `/api/refresh` has run
once. Either wait for the first scheduled run, or trigger it manually:

```bash
curl -X GET "https://<your-deployment>.vercel.app/api/refresh" \
  -H "Authorization: Bearer <your CRON_SECRET value>"
```

## Status indicator

The header shows a colour-coded pill so you can tell at a glance where the
displayed figures came from:

| Pill | Meaning |
|---|---|
| **Live — refreshed** (green) | `/api/data` returned a snapshot refreshed within the last 26 hours — i.e. the daily cron ran as expected. |
| **Data may be stale** (amber) | Live data loaded, but its refresh timestamp is older than 26 hours, so the 9am cron may not have run. |
| **Refresh failed** (red) | `/api/data` couldn't be reached at all; the page is showing the built-in fallback snapshot. |
| **Static snapshot** (grey) | Data loaded but carried no refresh timestamp — also the built-in fallback. |

Hover over the pill to see detail (e.g. the exact last-refresh time, or the
error message if the fetch failed). The 26-hour "fresh" window is set by
`FRESH_WINDOW_MS` in `public/index.html` — widen it if you move to a less
frequent refresh schedule.

## Timezone note

Vercel Cron schedules always run in **UTC**. `"0 9 * * *"` means 09:00 UTC,
which is **10am UK time during British Summer Time** (as now) and 9am UK
time in winter. If you want it to always land at 9am UK clock time
regardless of DST, you'd need two cron entries (one for summer, one for
winter) or handle the DST shift inside the function itself. For a test
dashboard, a fixed UTC time is usually fine.

## Adjusting the sheet range

`SHEET_RANGE` assumes the bridge sits in columns B (label) and C (value),
rows 8–16 — matching the layout of the sheet as it exists today:

```
Opening ARR              6,000
   New Logo                 20
   Expansion                30
   Price Increase           10
   Downsell                -10
   Churn                    -15
Closing ARR              6,035
   Online                   500
Closing ARR incl. Online 6,535
```

If the sheet layout changes, update `SHEET_RANGE` (and the label strings
in `api/refresh.js` if the row labels change) to match.
