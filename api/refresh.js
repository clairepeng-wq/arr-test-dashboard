// api/refresh.js
//
// Triggered by Vercel Cron (see vercel.json) every day at 09:00 UTC.
// Pulls the ARR bridge values out of the "Vercel Test Dashboard" Google Sheet
// using a service account, then writes the result as JSON to Vercel Blob so
// the dashboard can read it without hitting Google on every page load.

import { google } from 'googleapis';
import { put } from '@vercel/blob';

const BLOB_KEY = 'arr-bridge-data.json';

export default async function handler(req, res) {
  // Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`
  // when CRON_SECRET is set as an env var. This also lets you trigger the
  // endpoint manually (e.g. with curl) using the same header.
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Adjust this range to match where the label/value pairs actually sit
    // in the sheet. Based on the sheet as read on 31 Jul 2026, the bridge
    // lives in columns B (label) and C (value), rows 8-16.
    const range = process.env.SHEET_RANGE || 'Sheet1!B8:C16';

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range,
    });

    const rows = result.data.values || [];

    const map = {};
    for (const row of rows) {
      const [label, value] = row;
      if (!label) continue;
      const num = Number(String(value).replace(/[^\d.-]/g, ''));
      map[label.trim()] = Number.isFinite(num) ? num : 0;
    }

    const opening = map['Opening ARR'] || 0;
    const newLogo = map['New Logo'] || 0;
    const expansion = map['Expansion'] || 0;
    const priceIncrease = map['Price Increase'] || 0;
    const downsell = map['Downsell'] || 0;
    const churn = map['Churn'] || 0;
    const closing =
      map['Closing ARR'] ||
      opening + newLogo + expansion + priceIncrease + downsell + churn;
    const online = map['Online'] || 0;
    const closingIncl = map['Closing ARR incl. Online'] || closing + online;

    const payload = {
      asOf: new Date().toISOString().slice(0, 10),
      opening,
      newLogo,
      expansion,
      priceIncrease,
      downsell,
      churn,
      closing,
      online,
      closingIncl,
      refreshedAt: new Date().toISOString(),
    };

    await put(BLOB_KEY, JSON.stringify(payload), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });

    return res.status(200).json({ ok: true, payload });
  } catch (err) {
    console.error('refresh failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
