# ClearLedger — System Architecture (`ARCHITECTURE.md`)

## 1. Architectural Overview
ClearLedger is a **100% local-first, zero-runtime-dependency Progressive Web Application (PWA)** built with native ES Modules (JavaScript), semantic HTML5, modern CSS3 custom properties, IndexedDB, and a Service Worker.

### Why Zero Runtime Dependencies?
1. **Privacy & Trust**: Users auditing personal bank statements can inspect the entire readable codebase without auditing hundreds of transitive npm packages.
2. **Performance**: Total production bundle is under 80 KB uncompressed (~22 KB gzipped), delivering sub-100ms First Contentful Paint and zero framework hydration overhead.
3. **Zero Supply-Chain Risk**: No external CDN scripts, no telemetry, no third-party analytics, and strict Content Security Policy (`default-src 'self'; connect-src 'none'`).
4. **Offline Reliability**: Works identically on a plane, behind a corporate firewall, or as an installed desktop/mobile PWA.

## 2. Module Dependency Graph

```text
src/
├── index.html                  # Semantic app shell, SEO & Open Graph metadata
├── manifest.webmanifest        # PWA install manifest
├── sw.js                       # Offline-first cache Service Worker
├── styles/
│   ├── tokens.css              # Light/Dark WCAG AA/AAA semantic tokens
│   ├── base.css                # Reset, typography, focus-visible, print rules
│   ├── layout.css              # Responsive shell, sidebar, topbar, grids
│   └── components.css          # Buttons, cards, tables, charts, modals, forms
└── js/
    ├── core/
    │   ├── csv-parser.js       # RFC 4180 CSV/TSV parser, delimiter & number/date normalization
    │   ├── bank-mapper.js      # Bank preset detection (Chase, Amex, BofA, CapOne, Citi, Apple Card, YNAB)
    │   ├── categorizer.js      # Merchant normalization, 12 categories, transfer deduplication, custom rules
    │   ├── recurring-detector.js # Cadence detection, price-hike alerts, 30-day bill forecast, duplicate finder
    │   ├── analytics.js        # KPI aggregation, monthly cashflow, category totals, savings simulator
    │   └── storage.js          # IndexedDB adapter (with localStorage fallback), JSON backup, CSV export
    ├── data/
    │   └── sample-dataset.js   # Realistic 6-month, 3-account sample household ledger (clearly labeled)
    └── ui/
        ├── icons.js            # Crisp 1.5px-stroke inline SVG icon registry
        ├── formatters.js       # Currency, percent, date, and safe HTML escaping utilities
        ├── charts.js           # Perceptual-grade SVG charts (cashflow, category bars, savings bar)
        └── app.js              # Central state reducer, routing, keyboard shortcuts, interactive views
```

## 3. Data Flow & State Management

1. **Ingestion Pipeline**:
   `Raw CSV File` -> `parseCSV()` (delimiter, BOM, quoted fields) -> `detectBankPreset()` (auto-maps Date, Description, Amount or Debit/Credit, Category) -> User preview/override in Import Modal -> `normalizeTransactions()` (stable deduplication hash `date|amount|normalizedMerchant|account`, internal transfer detection) -> `applyCategorizationRules()` -> `IndexedDB` persistence.
2. **Analysis Pipeline (Pure Functions)**:
   `Transactions + Rules + Budgets + SubscriptionDecisions + ActiveFilters` -> `computeAnalytics()` + `detectRecurringCharges()` + `detectDuplicateCharges()` -> Immutable derived view-model -> Targeted DOM rendering.
3. **Security & Privacy Invariants**:
   - **Zero network egress**: `connect-src 'none'` in CSP prevents any script from transmitting financial data externally.
   - **XSS Defense**: Every user-supplied merchant string, account name, category, or CSV cell passes through `escapeHtml()` before DOM insertion; event delegation uses `data-*` attributes rather than inline `onclick` handlers.
   - **Safe Local Storage**: All persistence stays in browser IndexedDB (`clearledger_db_v1`) with a one-click "Wipe All Local Data" action that clears IndexedDB and `localStorage`.

## 4. Build & Test Pipeline
- **Unit & Integration Tests**: Native Node 18 `node:test` + `node:assert/strict` (`npm test`) testing CSV parsing edge cases, multi-bank column mapping, internal transfer deduplication, recurring cadence & price-hike detection, duplicate detection, and analytics math.
- **Browser E2E & Visual Verification**: Headless Chromium test harness validating desktop (`1440x900`), tablet (`768x1024`), and mobile (`375x812`) rendering, zero console errors, zero horizontal overflow, interactive state transitions, and keyboard navigation.
- **Production Build**: `scripts/build.mjs` bundles/minifies CSS and JS, copies optimized assets, injects cache-busted asset references, updates Service Worker asset manifest, and outputs a ready-to-deploy `dist/` directory.
