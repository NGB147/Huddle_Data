/* /api/data — shared CSV data, stored in Vercel Blob. */
import { put, list } from '@vercel/blob';

export const config = {
  runtime: 'nodejs',
  api: { bodyParser: { sizeLimit: '50mb' } }
};

const BLOB_KEY = 'dashboard-data.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: BLOB_KEY });
      if (!blobs.length) return res.status(200).json({ rows: [], filename: null, uploadedAt: null });
      const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
      const fetched = await fetch(latest.url, { cache: 'no-store' });
      if (!fetched.ok) throw new Error('Blob fetch failed: HTTP ' + fetched.status);
      const data = await fetched.json();
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {
          return res.status(400).json({ error: 'Invalid JSON body' });
        }
      }
      if (!body || !Array.isArray(body.rows) || !body.rows.length) {
        return res.status(400).json({ error: 'rows[] required and must be non-empty' });
      }
      const payload = {
        rows: body.rows,
        filename: String(body.filename || 'upload.csv'),
        uploadedAt: new Date().toISOString(),
        rowCount: body.rows.length
      };
      const blob = await put(BLOB_KEY, JSON.stringify(payload), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return res.status(200).json({
        ok: true,
        uploadedAt: payload.uploadedAt,
        filename: payload.filename,
        rowCount: payload.rowCount,
        url: blob.url
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('/api/data error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
