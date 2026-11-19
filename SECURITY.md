# Security & Privacy Policy

## Privacy Architecture
ClearLedger is engineered so financial data cannot leave the user's browser:
- **Zero Network Egress**: Content Security Policy enforces `default-src 'self'; connect-src 'none'; script-src 'self'`.
- **No Accounts or Telemetry**: ClearLedger does not collect emails, cookies, analytics, crash reports, or bank credentials.
- **Local Persistence**: Workspace state is stored exclusively in browser IndexedDB (`clearledger_db_v1`) with a `localStorage` fallback, and can be erased immediately via **Import & Privacy -> Wipe All Local Data**.

## XSS & Injection Prevention
- Every CSV cell, merchant name, description, account label, and custom rule is HTML-escaped via `escapeHtml()` before DOM rendering.
- No `eval()`, `new Function()`, or inline `onclick` attribute handlers are used.
- HTTP security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`) are configured in `netlify.toml`, `vercel.json`, and `scripts/serve.mjs`.

## Reporting a Vulnerability
If you discover a security issue (such as a CSV-to-HTML XSS bypass or CSP gap), please open a private security advisory on GitHub with reproduction steps and a sanitized CSV snippet.
