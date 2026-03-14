#!/usr/bin/env node
/* =====================================================
   QR Queue System — Local HTTP server
   Serves static files + SSE push for iPad display
   Usage:  node server.js [port]   (default 3000)
   ===================================================== */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2] || process.env.PORT || '3000', 10);
const ROOT = __dirname;

/* ── Shared state broadcast to all SSE clients ─── */
let currentState = {
  type:        'idle',   // 'idle' | 'queue' | 'scanned' | 'editing'
  currentSlot: null,     // "HH:MM"
  queueSlots:  [],       // ["HH:MM", ...]
  customer:    null,     // scanned customer fields
  formData:    null,     // live edited fields (null when unchanged)
  timestamp:   Date.now()
};

const sseClients = [];   // active SSE response objects

function broadcast(state) {
  currentState = { ...state, timestamp: Date.now() };
  const payload = `data: ${JSON.stringify(currentState)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

/* ── MIME types ───────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

/* ── Request handler ──────────────────────────────── */
const server = http.createServer((req, res) => {
  // CORS — needed when iPad accesses by IP
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  /* ── SSE stream: iPad subscribes here ── */
  if (url.pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',       // disable nginx buffering if behind proxy
    });
    // Immediately send current state so display is correct on connect
    res.write(`data: ${JSON.stringify(currentState)}\n\n`);
    sseClients.push(res);
    req.on('close', () => {
      const i = sseClients.indexOf(res);
      if (i !== -1) sseClients.splice(i, 1);
    });
    // Keep-alive ping every 20 s
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { clearInterval(ping); }
    }, 20000);
    req.on('close', () => clearInterval(ping));
    return;
  }

  /* ── State snapshot: staff page POSTs here ── */
  if (url.pathname === '/push-state' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const state = JSON.parse(body);
        broadcast(state);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400); res.end('Bad JSON');
      }
    });
    return;
  }

  /* ── GET /state — current snapshot (polling fallback) ── */
  if (url.pathname === '/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(currentState));
    return;
  }

  /* ── Static file serving ── */
  let filePath = path.join(ROOT, url.pathname === '/' ? '/scanner.html' : url.pathname);
  // Prevent directory traversal
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 — Not found: ${url.pathname}`);
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type':   mime,
      'Cache-Control':  'no-cache',
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'YOUR_IP';
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) { localIP = addr.address; break; }
    }
    if (localIP !== 'YOUR_IP') break;
  }
  console.log(`\n QR Queue System server running\n`);
  console.log(`  Staff interface:    http://localhost:${PORT}/scanner.html`);
  console.log(`  Customer display:   http://localhost:${PORT}/customer-display.html`);
  console.log(`\n  On iPad (same Wi-Fi network):`);
  console.log(`  Customer display:   http://${localIP}:${PORT}/customer-display.html\n`);
});
