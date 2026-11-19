# ClearLedger — Project Progress & Decision Log

**Last Updated:** 2026-11-18  
**Current Stage:** Release v1.0.0 — Completed & Verified  
**Product:** ClearLedger — Local-First Bank & Credit Card CSV Spend & Subscription Auditor

---

## 1. Original Market Research Findings (Verified 2025–2026)

- **YNAB**: $14.99/month or $109/year, no permanent free tier ([Plan & Multiply, Oct 2026](https://www.planandmultiply.com/en/blog/ynab-pricing-2026-plans-features-alternatives); [Stillware, Sep 2026](https://www.stillwareltd.com/blog/true-cost-of-ynab/)).
- **Monarch Money**: $14.99/month or $99.99/year Core ($16.67/mo Plus), no free tier, relies on Plaid/Finicity/MX ([Treasury, Nov 2026](https://treasury.sh/compare/rocket-money-vs-monarch); [Monarch Help, Nov 2026](https://help.monarch.com/hc/en-us/articles/360048393352-Guide-to-Connecting-Your-Accounts)).
- **Rocket Money**: Free plan excludes desktop/web browser access and manual transactions and requires Plaid/Akoya bank login; Premium $7–$14/mo, Premium+ $15/mo ([Wally Review, Oct 2026](https://wallybudgeting.app/reviews/rocket-money)).
- **Consumer Demand**: Active Reddit discussions seeking no-login local CSV spend analyzers, sync-free budgeting, and upcoming bill trackers ([r/Frugal](https://www.reddit.com/r/Frugal/comments/1ihhkf9/budgeting_apps_that_do_not_require_personal_info/), [r/Frugal (upcoming bills)](https://www.reddit.com/r/Frugal/comments/1tswv2l/free_budgeting_app_that_shows_upcoming_bills/), [r/ynab](https://www.reddit.com/r/ynab/comments/1ph0su8/do_other_budget_apps_have_as_many_sync_issues_as/), [r/Banking](https://www.reddit.com/r/Banking/comments/1qu0wta/which_tool_will_be_best_to_convert_bank_statement/), [Spendstat](https://spendstat.com/)).

## 2. Opportunity Evaluation Summary
Evaluated 10 distinct web product opportunities across 12 weighted criteria (max 155). **ClearLedger** ranked #1 (**151/155**), ahead of RedactBench (141), ChartPress (135), ClauseDiff (131), QuietCut (128), PayoffLab (128), SheetClean (124), TabSplit (123), TokenForge (121), and LocalVault (114).

## 3. Architecture & Technical Decisions
- **Zero-Runtime-Dependency ES Modules**: Chosen for financial auditability, zero supply-chain risk, sub-40 KB gzipped bundle, and offline reliability.
- **Strict Local-Only Security**: `connect-src 'none'` CSP, full HTML escaping (`escapeHtml`), IndexedDB (`clearledger_db_v1`) with `localStorage` fallback, and one-click local data erasure.
- **Visual Design**: Editorial paper light theme (`#F7F6F2` / `#165B43`) and carbon dark theme (`#0D100E` / `#3EA87E`), Newsreader/serif headings + tabular monospace numerals, Cleveland-McGill SVG charts with true zero baselines.

## 4. Problems Encountered & Solutions Implemented
1. **False-positive recurring alerts on variable retail merchants**: Initial visual QA revealed fluctuating grocery/retail rows appearing in price-hike alerts and pushing SVG charts below the fold. *Solution*: Tightened `recurring-detector.js` so variable retail categories require <=2% amount variance and price hikes require a stable flat baseline before firing. Reduced alerts to the 3 true anomalies (2 subscription hikes + 1 duplicate charge) and brought both SVG charts cleanly above the fold.
2. **Desktop mobile-menu button specificity collision**: `.btn { display: inline-flex }` in `components.css` overrode `.mobile-menu-btn { display: none }` in `layout.css`. *Solution*: Added explicit `@media (min-width: 861px) { .mobile-menu-btn { display: none; } }` and compacted the `<640px` mobile topbar to 2 clean rows.
3. **Sandbox Chromium policy blocking `127.0.0.1`**: Headless Chromium in the container blocks `localhost`/`127.0.0.1` via managed policy. *Solution*: Added `--host` support to `scripts/serve.mjs` and bound the test runner to loopback `127.0.0.2`, enabling full live Chromium E2E, responsive, and screenshot verification.

## 5. Verification & Build Status
- **Unit & Integration Tests (`npm test`)**: **10 / 10 passed** (CSV parsing, international numbers/dates, Chase/Amex/CapOne mapping, transfer deduplication, recurring & price-hike detection, duplicate detection, analytics math, CSV/JSON round-trip, XSS escaping).
- **Production Build (`npm run build`)**: **Succeeded** -> `dist/` (18.2 KB minified CSS, 12 syntax-verified ES modules, **132.9 KB raw / 39.1 KB gzipped** total HTML+CSS+JS).
- **Browser, Responsive & Visual QA (`tests/browser-verify.py`)**: **Passed on Chromium 156** across `1440x900` (light & dark), `768x1024`, and `375x812` with zero console errors, zero JS exceptions, and zero horizontal overflow. All 5 screenshots visually inspected.
- **Deployment Status**: Deployment-ready static `dist/` + `netlify.toml` + `vercel.json` + `.github/workflows/ci.yml`. Not yet publicly deployed (requires user hosting credentials).

## 6. Status Breakdown
### Completed
- [x] Market research, 10-opportunity evaluation matrix, and product selection
- [x] `DESIGN.md`, `ARCHITECTURE.md`, and complete modular implementation (`src/`)
- [x] Brand assets (`logo.svg`, `favicon.svg`, `icon-192.png`, `icon-512.png`, `og-card.png`) and SEO (`robots.txt`, `sitemap.xml`, Open Graph, JSON-LD)
- [x] Unit/integration test suite (`tests/core.test.mjs`) and headless Chromium E2E/visual verification (`tests/browser-verify.py`)
- [x] Production build (`dist/`), CI/CD workflow, Netlify/Vercel configs, and complete documentation (`README.md`, `LICENSE`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`)
- [x] GitHub-ready ZIP archive packaged and verified

### Planned (Post-v1.0 Roadmap)
- [ ] Optional WebCrypto AES-256-GCM passphrase encryption for JSON backups
- [ ] Web Worker offloading for 50,000+ transaction multi-year ledgers
- [ ] OFX / QFX statement file parser
