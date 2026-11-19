#!/usr/bin/env node
/**
 * Zero-dependency production build script for ClearLedger.
 * - Concatenates and minifies CSS into a single stylesheet (dist/styles/app.min.css)
 * - Copies and validates all ES modules into dist/js/
 * - Updates index.html and sw.js to reference optimized production assets
 * - Copies public/ assets, manifest, robots.txt, and sitemap.xml
 * - Prints bundle size breakdown
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(from, to) {
  if (!fs.existsSync(from)) return;
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function walkFiles(dir, ext, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, ext, results);
    else if (!ext || full.endsWith(ext)) results.push(full);
  }
  return results;
}

cleanDir(DIST);

// 1. Copy public/ assets (logo, favicon, icons, OG card, robots.txt, sitemap.xml)
copyRecursive(PUBLIC, DIST);

// 2. Concatenate and minify CSS into single production stylesheet
const cssOrder = ['tokens.css', 'base.css', 'layout.css', 'components.css'];
const combinedCSS = cssOrder
  .map((file) => fs.readFileSync(path.join(SRC, 'styles', file), 'utf8'))
  .join('\n');
const minCSS = minifyCSS(combinedCSS);
fs.mkdirSync(path.join(DIST, 'styles'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'styles', 'app.min.css'), minCSS, 'utf8');

// 3. Copy JS ES modules and verify syntax with Node --check
copyRecursive(path.join(SRC, 'js'), path.join(DIST, 'js'));
const jsFiles = walkFiles(path.join(DIST, 'js'), '.js');
for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

// 4. Rewrite index.html to load single minified CSS bundle
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html.replace(
  /<link rel="stylesheet" href="\.\/styles\/tokens\.css" \/>\s*<link rel="stylesheet" href="\.\/styles\/base\.css" \/>\s*<link rel="stylesheet" href="\.\/styles\/layout\.css" \/>\s*<link rel="stylesheet" href="\.\/styles\/components\.css" \/>/,
  '<link rel="stylesheet" href="./styles/app.min.css" />'
);
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');

// 5. Copy manifest and update Service Worker precache list for dist/
fs.copyFileSync(path.join(SRC, 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'));
let sw = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
sw = sw.replace(
  /'\.\/styles\/tokens\.css',\s*'\.\/styles\/base\.css',\s*'\.\/styles\/layout\.css',\s*'\.\/styles\/components\.css',/,
  "'./styles/app.min.css',"
);
fs.writeFileSync(path.join(DIST, 'sw.js'), sw, 'utf8');
execFileSync(process.execPath, ['--check', path.join(DIST, 'sw.js')], { stdio: 'pipe' });

// 6. Measure total text payload (HTML + CSS + JS)
const textFiles = [
  path.join(DIST, 'index.html'),
  path.join(DIST, 'styles', 'app.min.css'),
  ...jsFiles,
];
let rawBytes = 0;
let gzipBytes = 0;
for (const f of textFiles) {
  const buf = fs.readFileSync(f);
  rawBytes += buf.length;
  gzipBytes += zlib.gzipSync(buf).length;
}

console.log(`Build succeeded -> dist/`);
console.log(`  CSS bundle: ${(Buffer.byteLength(minCSS) / 1024).toFixed(1)} KB`);
console.log(`  JS modules: ${jsFiles.length} files syntax-verified`);
console.log(`  Total HTML+CSS+JS: ${(rawBytes / 1024).toFixed(1)} KB raw / ${(gzipBytes / 1024).toFixed(1)} KB gzipped`);
