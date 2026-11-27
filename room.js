// Bee839 Dedicated Real-Time Room & Lobby Sync API (Vercel Serverless Function)
// Uses a warm in-memory ring buffer pinned to Hong Kong (hkg1) for ultra-low latency & zero CORS/firewall issues.
const channels = globalThis.__BEE839_CHANNELS__ || (globalThis.__BEE839_CHANNELS__ = new Map());

function getChannel(name) {
  const key = String(name || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
  let ch = channels.get(key);
  if (!ch) {
    ch = { seq: 0, msgs: [], updatedAt: Date.now() };
    channels.set(key, ch);
  }
  ch.updatedAt = Date.now();
  // Prune stale channels older than 2 hours
  if (channels.size > 200) {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [k, v] of channels.entries()) {
      if (v.updatedAt < cutoff) channels.delete(k);
    }
  }
  return ch;
}

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const chName = (req.query && req.query.channel) || 'default';
  const ch = getChannel(chName);

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ ok: false, error: 'Invalid JSON payload' });
    }
    ch.seq += 1;
    ch.msgs.push({ seq: ch.seq, ts: Date.now(), data: body });
    if (ch.msgs.length > 150) ch.msgs.splice(0, ch.msgs.length - 150);
    return res.status(200).json({ ok: true, seq: ch.seq });
  }

  // GET: fetch messages after ?since=<seq>
  const since = Number((req.query && req.query.since) || 0) || 0;
  const fresh = since > 0 ? ch.msgs.filter(m => m.seq > since) : ch.msgs.slice(-40);
  return res.status(200).json({ ok: true, seq: ch.seq, messages: fresh });
};
