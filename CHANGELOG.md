# Changelog

All notable changes to ClearLedger are documented in this file.

## [1.0.0] - 2026-11-18

### Added
- RFC 4180 CSV/TSV/semicolon parser with BOM stripping, preamble header detection, and international currency/date normalization (`src/js/core/csv-parser.js`).
- Multi-bank column auto-mapper supporting Chase, American Express, Capital One, Apple Card, Citi, YNAB/Mint exports, and generic CSVs with interactive column-mapping preview modal (`src/js/core/bank-mapper.js`).
- Merchant normalization, internal credit-card payment/transfer deduplication, 12 financial categories, and user-editable categorization rules (`src/js/core/categorizer.js`).
- Algorithmic recurring charge detector with cadence classification, silent price-hike alerts, upcoming 30-day bills forecast, and duplicate charge finder (`src/js/core/recurring-detector.js`).
- Interactive subscription triage (`Keep`, `Review`, `Cancel`) with real-time annual savings calculator and 100% stacked triage bar.
- Perceptual-grade SVG visualizations: monthly cashflow grouped bar chart and clickable category spend bar chart with budget cap markers (`src/js/ui/charts.js`).
- Local-first IndexedDB persistence with `localStorage` fallback, categorized CSV export, JSON workspace backup/restore, print summary mode, and one-click local data wipe (`src/js/core/storage.js`).
- Light editorial paper and dark carbon themes meeting WCAG 2.2 AA/AAA contrast, offline PWA Service Worker, SEO/Open Graph metadata, automated Node unit tests, and headless Chromium E2E verification.
