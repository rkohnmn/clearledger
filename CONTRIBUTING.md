# Contributing to ClearLedger

Thank you for your interest in improving ClearLedger.

## Core Principles
1. **Local-First & Zero Uploads**: Never introduce external API calls, analytics, tracking pixels, or server-side bank credential handling. `connect-src 'none'` is a non-negotiable invariant.
2. **Zero Runtime Bloat**: Keep the browser runtime dependency-free unless a new capability cannot be implemented cleanly with standard Web Platform APIs.
3. **Verifiable Accuracy**: Every CSV bank preset, recurring-charge heuristic, or analytics change must include unit tests in `tests/core.test.mjs`.

## Local Workflow
1. Fork and clone the repository.
2. Run `npm run dev` to start the local development server on `http://127.0.0.1:4173`.
3. Add or update unit tests in `tests/core.test.mjs`.
4. Verify everything passes before opening a pull request:
   ```bash
   npm test
   npm run build
   ```
5. When adding a new bank CSV preset in `src/js/core/bank-mapper.js`, include a sanitized sample row test case (never commit real personal bank statements).
