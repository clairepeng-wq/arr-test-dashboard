// api/data.js
//
// Stable endpoint the dashboard calls on load. Reads the latest snapshot
// written by api/refresh.js from Vercel Blob and returns it as JSON.
// Kept separate from the blob URL itself so the front-end never needs to
// know Blob's storage details.

import { list } from '@vercel/blob';

const BLOB_KEY = 'arr-bridge-data.json';

export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    const blob = blobs.find((b) => b.pathname === BLOB_KEY) || blobs[0];

    if (!blob) {
      return res.status(404).json({ error: 'no data yet — has /api/refresh run at least once?' });
    }

    const upstream = await fetch(blob.url, { cache: 'no-store' });
    const json = await upstream.json();

    // Cache at the edge for a minute, but let stale data serve while
    // revalidating so the page never blocks on a slow fetch.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(json);
  } catch (err) {
    console.error('data fetch failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
