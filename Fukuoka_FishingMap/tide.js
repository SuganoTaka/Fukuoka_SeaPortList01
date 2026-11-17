const stations = new Set(['QF', 'O3', 'O6', 'KA']);
const cache = new Map();
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export function parseTide(text, station, date) {
  const [year, month, day] = date.split('-').map(Number);
  const line = text.split(/\r?\n/).find(row =>
    row.length >= 80 && row.slice(78, 80) === station &&
    Number(row.slice(72, 74)) === year % 100 &&
    Number(row.slice(74, 76)) === month && Number(row.slice(76, 78)) === day);
  if (!line) throw fail(404, '選択日の潮位予測が見つかりません。');
  const heights = Array.from({ length: 24 }, (_, i) => {
    const value = line.slice(i * 3, i * 3 + 3).trim();
    return /^-?\d+$/.test(value) && value !== '999' ? Number(value) : null;
  });
  if (heights.some(value => value === null)) throw fail(502, '潮位データが不完全です。');
  return heights;
}

export async function getTide(station, date) {
  if (!stations.has(station)) throw fail(400, '潮位地点が正しくありません。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw fail(400, '日付が正しくありません。');
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2099 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw fail(400, '日付が正しくありません。');
  }
  const key = `${year}:${station}`;
  let entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) {
    const promise = fetch(`https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/${year}/${station}.txt`, { signal: AbortSignal.timeout(15000) })
      .then(response => {
        if (!response.ok) throw new Error(`JMA HTTP ${response.status}`);
        return response.text();
      });
    entry = { expires: Date.now() + 3600000, promise };
    cache.set(key, entry);
    promise.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
    for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
  }
  const heights = parseTide(await entry.promise, station, date);
  const query = new URLSearchParams({ stn: station, ys: String(year), ms: String(month), ds: String(day), ye: String(year), me: String(month), de: String(day), S_HOURLY: 'on' });
  return { date, station, heights, source: `https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php?${query}` };
}
