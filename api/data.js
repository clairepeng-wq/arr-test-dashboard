// api/data.js
//
// Stable endpoint the dashboard calls on load. Reads the latest snapshot
// written by api/refresh.js from Vercel Blob and returns it as JSON.
// The store is private, so reads go through get() (OIDC-authenticated)
// rather than a plain fetch() of the blob URL.

import { get } from '@vercel/blob';

const BLOB_KEY = 'arr-bridge-data.json';

export default async function handler(req, res) {
  try {
    const result = await get(BLOB_KEY, { access: 'private', useCache: false });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return res.status(404).json({ error: 'no data yet — has /api/refresh run at least once?' });
    }

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(json);
  } catch (err) {
    console.error('data fetch failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
