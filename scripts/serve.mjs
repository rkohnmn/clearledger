#!/usr/bin/env node
/**
 * Minimal static HTTP server for local development and production preview.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const portIdx = args.indexOf('--port');
const hostIdx = args.indexOf('--host');
const targetDir = path.resolve(process.cwd(), dirIdx !== -1 ? args[dirIdx + 1] : 'dist');
const port = portIdx !== -1 ? Number(args[portIdx + 1]) : 4173;
const host = hostIdx !== -1 ? args[hostIdx + 1] : '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(targetDir, safePath === '/' ? 'index.html' : safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const publicFallback = path.join(process.cwd(), 'public', safePath);
    if (fs.existsSync(publicFallback) && fs.statSync(publicFallback).isFile()) {
      filePath = publicFallback;
    } else {
      filePath = path.join(targetDir, 'index.html');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`ClearLedger serving ${targetDir} at http://${host}:${port}`);
});
