import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getTide } from './tide.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/ports.json': ['ports.json', 'application/json; charset=utf-8']
};
const sendJson = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

createServer(async (req, res) => {
  try {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET のみ利用できます。' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/config') return sendJson(res, 200, { mapsKey: process.env.GOOGLE_MAPS_API_KEY || '' });
    if (url.pathname === '/api/tide') {
      try {
        return sendJson(res, 200, await getTide(url.searchParams.get('station'), url.searchParams.get('date')));
      } catch (error) {
        if (!error.statusCode) console.error('JMA tide request failed:', error);
        return sendJson(res, error.statusCode || 502, { error: error.statusCode ? error.message : '気象庁の潮位データを取得できませんでした。' });
      }
    }
    const file = files[url.pathname];
    if (!file) return sendJson(res, 404, { error: 'ページが見つかりません。' });
    const body = await readFile(path.join(root, file[0]));
    res.writeHead(200, { 'Content-Type': file[1], 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch (error) {
    console.error('Request failed:', error);
    if (!res.headersSent) sendJson(res, 500, { error: 'サーバーエラーが発生しました。' });
    else res.end();
  }
}).listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log(`Listening on ${process.env.PORT || 8080}`));
