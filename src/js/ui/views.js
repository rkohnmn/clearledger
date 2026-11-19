/**
 * Pure HTML view renderers for ClearLedger.
 * Every user-derived string is escaped via escapeHtml() to prevent XSS.
 */

import { CATEGORIES } from '../core/categorizer.js';
import { filterTransactions } from '../core/analytics.js';
import { renderCashflowChart, renderCategoryChart, renderSubscriptionTriageBar } from './charts.js';
import { escapeHtml, formatCurrency, formatDateShort, formatMonthLabel } from './formatters.js';
import { ICONS } from './icons.js';

export function renderOnboardingView() {
  return `
    <section class="onboarding-grid" aria-labelledby="onboarding-heading">
      <div>
        <h1 id="onboarding-heading" class="onboarding-title">Audit bank and card CSVs privately in your browser.</h1>
        <p class="onboarding-lead">
          Drop statements from checking accounts and credit cards to uncover forgotten subscriptions, silent price hikes, duplicate charges, and category leaks without bank logins, Plaid, or $100/year apps.
        </p>
        <div class="onboarding-actions">
          <button type="button" class="btn btn-primary" data-action="load-sample">
            ${ICONS.overview} Explore Sample Household Ledger
          </button>
          <button type="button" class="btn" data-action="trigger-file-input">
            ${ICONS.import} Import Bank CSV
          </button>
        </div>
        <div class="proof-list">
          <div class="proof-item">
            <strong>Zero network uploads</strong>
            CSV parsing, categorization, and IndexedDB storage run strictly on your device with <code>connect-src 'none'</code>.
          </div>
          <div class="proof-item">
            <strong>Price-hike &amp; duplicate alerts</strong>
            Automatically detects recurring cadences, flags rising monthly bills, and catches accidental double charges.
          </div>
          <div class="proof-item">
            <strong>Multi-account deduplication</strong>
            Recognizes internal credit-card payments and transfers so combined statements never double-count spending.
          </div>
          <div class="proof-item">
            <strong>Works offline as a PWA</strong>
            Install to your desktop or phone, back up as JSON, export categorized CSVs, or wipe local data in one click.
          </div>
        </div>
      </div>

      <div class="dropzone" data-dropzone="true">
        <div class="dropzone-icon">${ICONS.import}</div>
        <h2 class="dropzone-title">Drop one or more CSV statements here</h2>
        <p class="dropzone-sub">Auto-maps columns before importing. Nothing leaves your browser.</p>
        <button type="button" class="btn btn-primary" data-action="trigger-file-input">Choose CSV File</button>
        <div class="bank-chip-row" aria-label="Supported bank CSV formats">
          <span class="bank-chip">Chase</span>
          <span class="bank-chip">American Express</span>
          <span class="bank-chip">Capital One</span>
          <span class="bank-chip">Apple Card</span>
          <span class="bank-chip">Citi</span>
          <span class="bank-chip">YNAB / Mint</span>
          <span class="bank-chip">Any CSV</span>
        </div>
      </div>
    </section>
  `;
}

export function renderOverviewView(state, analytics) {
  const { kpis, priceHikes, duplicates, upcomingBills, topMerchants } = analytics;
  const cur = state.workspace.preferences.currency;

  const alertsHtml =
    priceHikes.length > 0 || duplicates.length > 0
      ? `
        <section class="alert-stack" aria-label="Audit alerts">
          ${priceHikes
            .map(
              (h) => `
              <div class="alert-row">
                <div class="alert-row-left">
                  <span class="alert-row-icon">${ICONS.trendUp}</span>
                  <span>
                    <strong>Price hike detected:</strong> ${escapeHtml(h.merchant)} increased from
                    <span class="mono">${escapeHtml(formatCurrency(h.previousAmount, cur))}</span> to
                    <span class="mono">${escapeHtml(formatCurrency(h.newAmount, cur))}</span>
                    (<strong>+${escapeHtml(formatCurrency(h.delta, cur))}</strong> / +${h.percentIncrease.toFixed(1)}%, +${escapeHtml(formatCurrency(h.annualImpact, cur))}/yr)
                  </span>
                </div>
                <button type="button" class="btn btn-sm" data-action="navigate" data-view="subscriptions">Review subscription</button>
              </div>
            `
            )
            .join('')}
          ${duplicates
            .map(
              (d) => `
              <div class="alert-row">
                <div class="alert-row-left">
                  <span class="alert-row-icon">${ICONS.alert}</span>
                  <span>
                    <strong>Possible duplicate charge:</strong> ${escapeHtml(d.merchant)} billed
                    <span class="mono">${escapeHtml(formatCurrency(d.amount, cur))}</span> twice on
                    ${escapeHtml(formatDateShort(d.firstDate))} &amp; ${escapeHtml(formatDateShort(d.secondDate))} (${escapeHtml(d.account)})
                  </span>
                </div>
                <button type="button" class="btn btn-sm" data-action="search-merchant" data-merchant="${escapeHtml(d.merchant)}">Inspect in ledger</button>
              </div>
            `
            )
            .join('')}
        </section>
      `
      : '';

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">Financial Audit Overview</h1>
        <p class="page-subtitle">
          ${kpis.transactionCount} transactions across ${analytics.accounts.length} account${analytics.accounts.length === 1 ? '' : 's'}
          ${kpis.transferCount > 0 ? `(${kpis.transferCount} internal transfers totaling ${escapeHtml(formatCurrency(kpis.transferVolume, cur))} excluded)` : ''}
        </p>
      </div>
      <div class="toolbar-group no-print">
        <button type="button" class="btn btn-sm" data-action="print-report">${ICONS.print} Print Summary</button>
        <button type="button" class="btn btn-primary btn-sm" data-action="trigger-file-input">${ICONS.import} Add CSV</button>
      </div>
    </div>

    <section class="kpi-grid" aria-label="Key metrics">
      <div class="card kpi-card">
        <span class="kpi-label">Net Cashflow</span>
        <span class="kpi-value mono ${kpis.netCashflow >= 0 ? 'is-pos' : 'is-neg'}">${escapeHtml(formatCurrency(kpis.netCashflow, cur, { showPlus: true }))}</span>
        <span class="kpi-meta">${kpis.totalIncome > 0 ? `${kpis.savingsRate.toFixed(1)}% savings rate` : 'Expenses-only statement'}</span>
      </div>
      <div class="card kpi-card">
        <span class="kpi-label">Total Spending</span>
        <span class="kpi-value mono">${escapeHtml(formatCurrency(kpis.totalExpenses, cur))}</span>
        <span class="kpi-meta">${escapeHtml(formatCurrency(kpis.avgMonthlySpend, cur))}/mo average</span>
      </div>
      <div class="card kpi-card">
        <span class="kpi-label">Recurring Burn</span>
        <span class="kpi-value mono">${escapeHtml(formatCurrency(kpis.recurringMonthlyTotal, cur))}/mo</span>
        <span class="kpi-meta">${escapeHtml(formatCurrency(kpis.recurringAnnualTotal, cur))}/yr across ${analytics.recurring.length} bills</span>
      </div>
      <div class="card kpi-card">
        <span class="kpi-label">Cancel Savings Target</span>
        <span class="kpi-value mono is-pos">${escapeHtml(formatCurrency(kpis.potentialAnnualSavings, cur))}/yr</span>
        <span class="kpi-meta">${kpis.potentialAnnualSavings > 0 ? `${escapeHtml(formatCurrency(kpis.potentialAnnualSavings / 12, cur))}/mo reclaimed` : 'Mark items in Subscriptions'}</span>
      </div>
    </section>

    ${alertsHtml}

    <section class="split-grid">
      <div class="card">${renderCashflowChart(analytics.monthlySeries, cur)}</div>
      <div class="card">${renderCategoryChart(analytics.categories, cur, state.filters.category, Math.max(kpis.monthCount, 1))}</div>
    </section>

    <section class="two-col-grid">
      <div class="card">
        <div class="chart-header">
          <div>
            <h3 class="chart-title">Upcoming 30-Day Bills (${escapeHtml(formatCurrency(kpis.upcoming30DayTotal, cur))})</h3>
            <p class="chart-subtitle">Projected from recurring cadences relative to latest statement date (${escapeHtml(analytics.referenceDate ? formatDateShort(analytics.referenceDate) : '—')})</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-action="navigate" data-view="subscriptions">All recurring</button>
        </div>
        ${
          upcomingBills.length === 0
            ? `<p class="chart-empty">No recurring bills projected in the next 30 days.</p>`
            : upcomingBills
                .slice(0, 7)
                .map(
                  (b) => `
                  <div class="bill-row">
                    <div>
                      <strong>${escapeHtml(b.merchant)}</strong>
                      <div class="kpi-meta">${escapeHtml(formatDateShort(b.nextExpectedDate))} · in ${b.daysUntil} day${b.daysUntil === 1 ? '' : 's'} · ${escapeHtml(b.category)}</div>
                    </div>
                    <span class="mono"><strong>${escapeHtml(formatCurrency(b.latestAmount, cur))}</strong></span>
                  </div>
                `
                )
                .join('')
        }
      </div>

      <div class="card">
        <div class="chart-header">
          <div>
            <h3 class="chart-title">Top Merchants by Outflow</h3>
            <p class="chart-subtitle">Click any merchant to inspect every matching transaction</p>
          </div>
        </div>
        ${
          topMerchants.length === 0
            ? `<p class="chart-empty">No merchant expenses recorded.</p>`
            : topMerchants
                .slice(0, 7)
                .map(
                  (m) => `
                  <div class="bill-row">
                    <div>
                      <button type="button" class="btn btn-ghost btn-sm" style="padding:0;min-height:auto;font-weight:600;color:var(--text-primary)" data-action="search-merchant" data-merchant="${escapeHtml(m.merchant)}">${escapeHtml(m.merchant)}</button>
                      <div class="kpi-meta">${m.count} charge${m.count === 1 ? '' : 's'} · ${escapeHtml(m.category)}</div>
                    </div>
                    <span class="mono"><strong>${escapeHtml(formatCurrency(m.total, cur))}</strong></span>
                  </div>
                `
                )
                .join('')
        }
      </div>
    </section>
  `;
}

export function renderSubscriptionsView(state, analytics) {
  const { recurring, kpis } = analytics;
  const cur = state.workspace.preferences.currency;

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">Subscriptions &amp; Recurring Bills</h1>
        <p class="page-subtitle">Triage recurring charges as Keep, Review, or Cancel to calculate your exact annual savings.</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      ${renderSubscriptionTriageBar(kpis, cur)}
      ${
        recurring.length === 0
          ? `<p class="chart-empty">Import at least 2 months of statements to detect recurring subscriptions and bills.</p>`
          : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Cadence</th>
                    <th>Category</th>
                    <th class="text-right">Latest Charge</th>
                    <th class="text-right">Annualized</th>
                    <th>Next Est.</th>
                    <th>Triage Decision</th>
                  </tr>
                </thead>
                <tbody>
                  ${recurring
                    .map(
                      (r) => `
                      <tr>
                        <td>
                          <strong>${escapeHtml(r.merchant)}</strong>
                          ${
                            r.priceHike
                              ? `<div><span class="pill pill-danger">+${escapeHtml(formatCurrency(r.priceHike.delta, cur))} hike (+${r.priceHike.percentIncrease.toFixed(0)}%)</span></div>`
                              : ''
                          }
                        </td>
                        <td><span class="pill">${escapeHtml(r.cadenceLabel)} (${r.occurrences}x)</span></td>
                        <td>${escapeHtml(r.category)}</td>
                        <td class="text-right mono">${escapeHtml(formatCurrency(r.latestAmount, cur))}</td>
                        <td class="text-right mono"><strong>${escapeHtml(formatCurrency(r.annualCost, cur))}</strong></td>
                        <td class="mono">${escapeHtml(formatDateShort(r.nextExpectedDate))}</td>
                        <td>
                          <div class="seg-group" role="group" aria-label="Triage ${escapeHtml(r.merchant)}">
                            ${['keep', 'review', 'cancel']
                              .map(
                                (mode) => `
                                <button type="button" class="seg-btn ${r.decision === mode ? `is-${mode}` : ''}"
                                  data-action="set-decision"
                                  data-merchant-key="${escapeHtml(r.merchantKey)}"
                                  data-decision="${mode}"
                                  aria-pressed="${r.decision === mode ? 'true' : 'false'}">
                                  ${mode[0].toUpperCase() + mode.slice(1)}
                                </button>
                              `
                              )
                              .join('')}
                          </div>
                        </td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
      }
    </div>
  `;
}

export function renderLedgerView(state, analytics) {
  const cur = state.workspace.preferences.currency;
  const filtered = filterTransactions(state.workspace.transactions, state.filters);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(state.ledgerPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">Transactions Ledger</h1>
        <p class="page-subtitle">Showing ${filtered.length} of ${state.workspace.transactions.length} transactions. Reassign any category to update charts immediately.</p>
      </div>
      <div class="toolbar-group no-print">
        <button type="button" class="btn btn-sm" data-action="export-csv">${ICONS.export} Export CSV</button>
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="toolbar-group">
          <div class="input-search-wrap">
            ${ICONS.search}
            <input id="ledger-search-input" type="search" class="input input-search" placeholder="Search merchant, memo, date..." value="${escapeHtml(state.filters.search)}" data-filter="search" aria-label="Search transactions" />
          </div>
          <select class="select" data-filter="category" aria-label="Filter by category">
            <option value="all">All categories</option>
            ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${state.filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>
          <select class="select" data-filter="type" aria-label="Filter by transaction type">
            <option value="all" ${state.filters.type === 'all' ? 'selected' : ''}>All types</option>
            <option value="expense" ${state.filters.type === 'expense' ? 'selected' : ''}>Expenses</option>
            <option value="income" ${state.filters.type === 'income' ? 'selected' : ''}>Income</option>
            <option value="transfer" ${state.filters.type === 'transfer' ? 'selected' : ''}>Transfers</option>
          </select>
        </div>
        ${
          state.filters.search || state.filters.category !== 'all' || state.filters.type !== 'all'
            ? `<button type="button" class="btn btn-ghost btn-sm" data-action="reset-filters">Reset filters</button>`
            : ''
        }
      </div>

      ${
        visible.length === 0
          ? `<p class="chart-empty">No transactions match the current filters.</p>`
          : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Merchant</th>
                    <th>Account</th>
                    <th>Category</th>
                    <th class="text-right">Amount</th>
                    <th>Transfer</th>
                  </tr>
                </thead>
                <tbody>
                  ${visible
                    .map(
                      (tx) => `
                      <tr>
                        <td class="mono">${escapeHtml(tx.date)}</td>
                        <td>
                          <strong>${escapeHtml(tx.merchant)}</strong>
                          ${tx.description !== tx.merchant ? `<div class="kpi-meta">${escapeHtml(tx.description)}</div>` : ''}
                        </td>
                        <td><span class="pill">${escapeHtml(tx.account)}</span></td>
                        <td>
                          <select class="select" style="min-height:30px;padding:3px 8px;font-size:0.8rem" data-action="change-tx-category" data-tx-id="${escapeHtml(tx.id)}" aria-label="Category for ${escapeHtml(tx.merchant)}">
                            ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${tx.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                          </select>
                        </td>
                        <td class="text-right mono ${tx.isTransfer ? 'amount-transfer' : tx.amount >= 0 ? 'amount-pos' : 'amount-neg'}">
                          ${escapeHtml(formatCurrency(tx.amount, cur, { showPlus: tx.amount > 0 }))}
                        </td>
                        <td>
                          <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-transfer" data-tx-id="${escapeHtml(tx.id)}" title="Toggle internal transfer exclusion">
                            ${tx.isTransfer ? 'Excluded' : 'Counted'}
                          </button>
                        </td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
            ${
              totalPages > 1
                ? `
                  <div class="toolbar" style="margin-top:14px;margin-bottom:0">
                    <span class="kpi-meta">Page ${currentPage} of ${totalPages}</span>
                    <div class="toolbar-group">
                      <button type="button" class="btn btn-sm" data-action="ledger-page" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>Previous</button>
                      <button type="button" class="btn btn-sm" data-action="ledger-page" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
                    </div>
                  </div>
                `
                : ''
            }
          `
      }
    </div>
  `;
}

export function renderRulesBudgetsView(state, analytics) {
  const cur = state.workspace.preferences.currency;
  const rules = state.workspace.customRules || [];
  const budgets = state.workspace.budgets || {};
  const spendByCat = new Map(analytics.categories.map((c) => [c.category, c]));
  const editableCategories = CATEGORIES.filter((c) => c !== 'Income' && c !== 'Transfers');

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">Categorization Rules &amp; Monthly Caps</h1>
        <p class="page-subtitle">Saved locally in IndexedDB and automatically applied to every future CSV import.</p>
      </div>
    </div>

    <div class="two-col-grid">
      <div class="card">
        <h2 style="font-size:1.2rem;margin-bottom:10px">Custom Merchant Rules</h2>
        <form id="rule-form" class="form-grid" style="margin-bottom:14px">
          <div class="field">
            <label for="rule-pattern">Merchant contains</label>
            <input id="rule-pattern" name="pattern" class="input" placeholder="e.g. COSTCO or EQUINOX" required />
          </div>
          <div class="field">
            <label for="rule-category">Assign category</label>
            <select id="rule-category" name="category" class="select">
              ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div style="grid-column:1/-1">
            <button type="submit" class="btn btn-primary btn-sm">${ICONS.plus} Save &amp; Apply Rule</button>
          </div>
        </form>

        ${
          rules.length === 0
            ? `<p class="kpi-meta">No custom rules yet. Add one above to override built-in categorization.</p>`
            : rules
                .map(
                  (r, i) => `
                  <div class="bill-row">
                    <div>
                      <code class="mono">${escapeHtml(r.pattern)}</code> &rarr; <span class="pill pill-accent">${escapeHtml(r.category)}</span>
                    </div>
                    <button type="button" class="btn btn-ghost btn-sm" data-action="delete-rule" data-rule-index="${i}" aria-label="Delete rule ${escapeHtml(r.pattern)}">${ICONS.trash}</button>
                  </div>
                `
                )
                .join('')
        }
      </div>

      <div class="card">
        <h2 style="font-size:1.2rem;margin-bottom:10px">Monthly Category Caps</h2>
        <p class="kpi-meta" style="margin-bottom:14px">Compare your monthly average against personal spending limits.</p>
        ${editableCategories
          .map((cat) => {
            const cap = budgets[cat] || '';
            const stats = spendByCat.get(cat);
            const avg = stats ? stats.monthlyAvg : 0;
            const over = cap && avg > Number(cap);
            return `
              <div class="bill-row">
                <div>
                  <strong>${escapeHtml(cat)}</strong>
                  <div class="kpi-meta">Avg ${escapeHtml(formatCurrency(avg, cur))}/mo ${over ? `<span class="pill pill-danger">Over cap</span>` : ''}</div>
                </div>
                <div class="toolbar-group">
                  <label class="sr-only" for="budget-${escapeHtml(cat)}">Monthly cap for ${escapeHtml(cat)}</label>
                  <input id="budget-${escapeHtml(cat)}" type="number" min="0" step="10" class="input mono" style="width:110px;text-align:right" placeholder="No cap" value="${escapeHtml(cap)}" data-action="update-budget" data-category="${escapeHtml(cat)}" />
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

export function renderImportPrivacyView(state) {
  const cur = state.workspace.preferences.currency;
  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">Import, Export &amp; Local Privacy</h1>
        <p class="page-subtitle">Your financial records never leave this browser. Back up, export, or erase everything at any time.</p>
      </div>
    </div>

    <div class="two-col-grid">
      <div class="card">
        <h2 style="font-size:1.2rem;margin-bottom:12px">Import Bank or Card CSV</h2>
        <div class="dropzone" data-dropzone="true">
          <div class="dropzone-icon">${ICONS.import}</div>
          <p class="dropzone-title">Drag CSV statements here</p>
          <p class="dropzone-sub">Multi-account imports automatically deduplicate repeated rows and flag internal card payments.</p>
          <button type="button" class="btn btn-primary" data-action="trigger-file-input">Select CSV File</button>
        </div>
      </div>

      <div class="card">
        <h2 style="font-size:1.2rem;margin-bottom:12px">Workspace Controls &amp; Backups</h2>
        <div class="field" style="margin-bottom:14px">
          <label for="currency-select">Display Currency</label>
          <select id="currency-select" class="select" data-action="change-currency">
            ${['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((c) => `<option value="${c}" ${cur === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-group" style="margin-bottom:18px">
          <button type="button" class="btn btn-sm" data-action="export-csv">${ICONS.export} Export Categorized CSV</button>
          <button type="button" class="btn btn-sm" data-action="export-json">${ICONS.export} Download JSON Backup</button>
          <button type="button" class="btn btn-sm" data-action="trigger-json-input">${ICONS.import} Restore JSON Backup</button>
        </div>
        <div style="padding-top:14px;border-top:1px solid var(--border-hairline)">
          <p class="kpi-meta" style="margin-bottom:10px">Erase all transactions, custom rules, budgets, and subscription decisions from IndexedDB and localStorage.</p>
          <button type="button" class="btn btn-danger btn-sm" data-action="wipe-data">${ICONS.trash} Wipe All Local Data</button>
        </div>
      </div>
    </div>
  `;
}

export function renderImportMapperModal(pendingImport) {
  if (!pendingImport) return '';
  const { fileName, parsed, mapping, accountName } = pendingImport;
  const headerOpts = [''].concat(parsed.headers);
  const previewRows = parsed.rows.slice(0, 5);

  const selectField = (id, label, fieldKey) => `
    <div class="field">
      <label for="${id}">${label}</label>
      <select id="${id}" class="select" data-mapper-field="${fieldKey}">
        ${headerOpts
          .map(
            (h) =>
              `<option value="${escapeHtml(h)}" ${mapping[fieldKey] === h ? 'selected' : ''}>${h ? escapeHtml(h) : '— None —'}</option>`
          )
          .join('')}
      </select>
    </div>
  `;

  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mapper-title">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <h2 id="mapper-title" style="font-size:1.3rem">Confirm CSV Column Mapping</h2>
            <p class="kpi-meta">${escapeHtml(fileName)} · ${parsed.rows.length} rows detected · Preset: <strong>${escapeHtml(mapping.presetLabel)}</strong></p>
          </div>
          <button type="button" class="btn btn-ghost btn-icon" data-action="close-modal" aria-label="Close mapping dialog">${ICONS.close}</button>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="map-account">Account Label</label>
            <input id="map-account" class="input" value="${escapeHtml(accountName)}" data-mapper-field="accountName" />
          </div>
          ${selectField('map-date', 'Date Column', 'dateCol')}
          ${selectField('map-desc', 'Description / Merchant Column', 'descriptionCol')}
          ${selectField('map-amount', 'Single Amount Column', 'amountCol')}
          ${selectField('map-debit', 'Debit / Outflow Column (optional)', 'debitCol')}
          ${selectField('map-credit', 'Credit / Inflow Column (optional)', 'creditCol')}
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-size:0.84rem;margin-bottom:14px">
          <input type="checkbox" data-mapper-field="invertSign" ${mapping.invertSign ? 'checked' : ''} />
          Invert amount signs (enable if expenses appear as positive numbers, e.g., Amex / Apple Card)
        </label>

        <div class="table-wrap" style="margin-bottom:16px;border:1px solid var(--border-hairline);border-radius:var(--radius-md)">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th class="text-right">Raw Amount / Debit / Credit</th>
              </tr>
            </thead>
            <tbody>
              ${previewRows
                .map((row) => {
                  const rawVal = mapping.amountCol
                    ? row[mapping.amountCol]
                    : `${row[mapping.debitCol] || ''} / ${row[mapping.creditCol] || ''}`;
                  return `
                    <tr>
                      <td class="mono">${escapeHtml(row[mapping.dateCol] || '')}</td>
                      <td>${escapeHtml(row[mapping.descriptionCol] || '')}</td>
                      <td class="text-right mono">${escapeHtml(rawVal)}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        <div class="toolbar" style="margin-bottom:0">
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="confirm-import">${ICONS.check} Import ${parsed.rows.length} Rows</button>
        </div>
      </div>
    </div>
  `;
}
