/**
 * ClearLedger Application Controller
 * Explicit state management, IndexedDB sync, keyboard shortcuts, drag-and-drop CSV import,
 * and offline PWA Service Worker registration.
 */

import { parseCSV } from '../core/csv-parser.js';
import { detectColumnMapping, normalizeRowsToTransactions } from '../core/bank-mapper.js';
import { applyRulesToTransactions } from '../core/categorizer.js';
import { computeAnalytics } from '../core/analytics.js';
import {
  DEFAULT_WORKSPACE,
  exportTransactionsToCSV,
  loadWorkspace,
  parseWorkspaceBackup,
  saveWorkspace,
  wipeWorkspace,
} from '../core/storage.js';
import { createSampleDataset } from '../data/sample-dataset.js';
import { ICONS } from './icons.js';
import { escapeHtml, formatMonthLabel } from './formatters.js';
import {
  renderImportMapperModal,
  renderImportPrivacyView,
  renderLedgerView,
  renderOnboardingView,
  renderOverviewView,
  renderRulesBudgetsView,
  renderSubscriptionsView,
} from './views.js';

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: ICONS.overview, key: '1' },
  { id: 'subscriptions', label: 'Subscriptions', icon: ICONS.subscriptions, key: '2' },
  { id: 'ledger', label: 'Transactions', icon: ICONS.ledger, key: '3' },
  { id: 'rules', label: 'Rules & Caps', icon: ICONS.rules, key: '4' },
  { id: 'import', label: 'Import & Privacy', icon: ICONS.import, key: '5' },
];

const state = {
  status: 'loading',
  activeView: 'overview',
  mobileNavOpen: false,
  ledgerPage: 1,
  toast: null,
  pendingImport: null,
  filters: {
    search: '',
    account: 'all',
    category: 'all',
    type: 'all',
    month: 'all',
  },
  workspace: structuredClone(DEFAULT_WORKSPACE),
};

let toastTimer = null;

function showToast(message) {
  state.toast = message;
  render();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = null;
    render();
  }, 3600);
}

async function persist() {
  await saveWorkspace(state.workspace);
}

function applyTheme() {
  const theme = state.workspace.preferences.theme || 'light';
  document.documentElement.dataset.theme = theme;
}

function render() {
  applyTheme();
  const root = document.getElementById('app');
  if (!root) return;

  const hasData = state.workspace.transactions.length > 0;
  const analytics = computeAnalytics(state.workspace.transactions, {
    decisions: state.workspace.decisions,
    budgets: state.workspace.budgets,
    accountFilter: state.filters.account,
    monthFilter: state.filters.month,
  });

  const alertCount = analytics.priceHikes.length + analytics.duplicates.length;

  let stageHtml = '';
  if (!hasData && state.activeView !== 'import' && state.activeView !== 'rules') {
    stageHtml = renderOnboardingView();
  } else if (state.activeView === 'overview') {
    stageHtml = renderOverviewView(state, analytics);
  } else if (state.activeView === 'subscriptions') {
    stageHtml = renderSubscriptionsView(state, analytics);
  } else if (state.activeView === 'ledger') {
    stageHtml = renderLedgerView(state, analytics);
  } else if (state.activeView === 'rules') {
    stageHtml = renderRulesBudgetsView(state, analytics);
  } else {
    stageHtml = renderImportPrivacyView(state);
  }

  const theme = state.workspace.preferences.theme || 'light';

  root.innerHTML = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <div class="app-shell">
      <div class="mobile-overlay ${state.mobileNavOpen ? 'is-open' : ''}" data-action="close-mobile-nav"></div>
      <aside class="sidebar ${state.mobileNavOpen ? 'is-open' : ''}" aria-label="Primary navigation">
        <div class="brand-lockup">
          <img src="./assets/logo.svg" alt="" class="brand-mark" width="28" height="28" />
          <span class="brand-name">ClearLedger</span>
        </div>
        <nav class="nav-list">
          ${VIEWS.map((v) => {
            const badge =
              v.id === 'subscriptions' && analytics.recurring.length > 0
                ? `<span class="nav-badge ${analytics.priceHikes.length > 0 ? 'is-alert' : ''}">${analytics.recurring.length}</span>`
                : v.id === 'overview' && alertCount > 0
                  ? `<span class="nav-badge is-alert">${alertCount}</span>`
                  : `<span class="kbd-hint">${v.key}</span>`;
            return `
              <button type="button" class="nav-item ${state.activeView === v.id ? 'is-active' : ''}"
                data-action="navigate" data-view="${v.id}" aria-current="${state.activeView === v.id ? 'page' : 'false'}">
                <span class="nav-item-left">${v.icon}<span>${v.label}</span></span>
                ${badge}
              </button>
            `;
          }).join('')}
        </nav>
        <div class="sidebar-privacy">
          <div class="sidebar-privacy-title">${ICONS.shield} Local-Only Mode</div>
          <div>Zero servers, zero bank logins. Statements stay strictly in your browser.</div>
        </div>
      </aside>

      <div class="main-column">
        <header class="topbar">
          <div class="topbar-left">
            <button type="button" class="btn btn-icon mobile-menu-btn" data-action="toggle-mobile-nav" aria-label="Open navigation menu" aria-expanded="${state.mobileNavOpen ? 'true' : 'false'}">
              ${ICONS.menu}
            </button>
            ${
              hasData
                ? `
                  <select class="select" data-filter="account" aria-label="Filter by account">
                    <option value="all">All accounts (${analytics.accounts.length})</option>
                    ${analytics.accounts.map((a) => `<option value="${escapeHtml(a)}" ${state.filters.account === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}
                  </select>
                  <select class="select" data-filter="month" aria-label="Filter by month">
                    <option value="all">All months (${analytics.months.length})</option>
                    ${analytics.months.map((m) => `<option value="${escapeHtml(m)}" ${state.filters.month === m ? 'selected' : ''}>${escapeHtml(formatMonthLabel(m))}</option>`).join('')}
                  </select>
                `
                : `<span class="kpi-meta">Private CSV Spend &amp; Subscription Auditor</span>`
            }
          </div>
          <div class="topbar-right">
            <button type="button" class="btn btn-sm" data-action="trigger-file-input">${ICONS.import} Import CSV</button>
            <button type="button" class="btn btn-icon" data-action="toggle-theme" aria-label="Switch to ${theme === 'dark' ? 'light' : 'dark'} theme" title="Toggle theme">
              ${theme === 'dark' ? ICONS.sun : ICONS.moon}
            </button>
          </div>
        </header>

        <main id="main-content" class="main-stage" tabindex="-1">
          ${
            state.workspace.isSample && hasData
              ? `
                <div class="sample-banner" role="status">
                  <span><strong>Sample Household Ledger loaded (May–Oct 2026)</strong> — Explore real price-hike &amp; duplicate alerts, then drop your own bank CSV to replace or clear it.</span>
                  <div class="toolbar-group">
                    <button type="button" class="btn btn-primary btn-sm" data-action="trigger-file-input">Import My CSV</button>
                    <button type="button" class="btn btn-sm" data-action="wipe-data">Clear Sample</button>
                  </div>
                </div>
              `
              : ''
          }
          ${stageHtml}
        </main>
      </div>
    </div>

    <input id="csv-file-input" type="file" accept=".csv,.tsv,.txt,text/csv" class="sr-only" />
    <input id="json-file-input" type="file" accept=".json,application/json" class="sr-only" />
    ${renderImportMapperModal(state.pendingImport)}
    ${state.toast ? `<div class="toast" role="status" aria-live="polite">${escapeHtml(state.toast)}</div>` : ''}
  `;
}

async function handleCSVFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseCSV(text);
    const mapping = detectColumnMapping(parsed.headers, parsed.rows);
    const defaultAccount = file.name.replace(/\.(csv|tsv|txt)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported Account';

    state.pendingImport = {
      fileName: file.name,
      parsed,
      mapping,
      accountName: defaultAccount,
    };
    render();
  } catch (err) {
    showToast(`Could not parse ${file.name}: ${err.message}`);
  }
}

async function commitPendingImport() {
  if (!state.pendingImport) return;
  const { parsed, mapping, accountName } = state.pendingImport;
  const { transactions, skipped } = normalizeRowsToTransactions(parsed.rows, mapping, {
    accountName,
    customRules: state.workspace.customRules,
    isSample: false,
  });

  if (transactions.length === 0) {
    showToast('No valid transactions found with the selected columns. Check Date and Amount columns.');
    return;
  }

  // Replace sample data automatically if user imports their first real CSV
  const baseList = state.workspace.isSample ? [] : state.workspace.transactions;
  const existingKeys = new Set(baseList.map((tx) => tx.fingerprint));
  const fresh = transactions.filter((tx) => !existingKeys.has(tx.fingerprint));
  const duplicateCount = transactions.length - fresh.length;

  state.workspace.transactions = [...fresh, ...baseList].sort((a, b) => b.date.localeCompare(a.date));
  state.workspace.isSample = false;
  state.pendingImport = null;
  state.activeView = 'overview';
  await persist();
  render();
  showToast(
    `Imported ${fresh.length} transactions${duplicateCount > 0 ? ` (${duplicateCount} duplicates skipped)` : ''}${skipped.length > 0 ? `, ${skipped.length} non-data rows skipped` : ''}.`
  );
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function attachGlobalListeners() {
  document.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'navigate') {
      state.activeView = target.dataset.view || 'overview';
      state.mobileNavOpen = false;
      render();
    } else if (action === 'toggle-mobile-nav') {
      state.mobileNavOpen = !state.mobileNavOpen;
      render();
    } else if (action === 'close-mobile-nav') {
      state.mobileNavOpen = false;
      render();
    } else if (action === 'toggle-theme') {
      state.workspace.preferences.theme = state.workspace.preferences.theme === 'dark' ? 'light' : 'dark';
      await persist();
      render();
    } else if (action === 'load-sample') {
      state.workspace.transactions = createSampleDataset();
      state.workspace.isSample = true;
      state.workspace.decisions = { 'streamflix.com monthly': 'cancel', 'planet fitness club dues': 'review' };
      state.activeView = 'overview';
      await persist();
      render();
      showToast('Loaded 6-month Sample Household Ledger.');
    } else if (action === 'trigger-file-input') {
      document.getElementById('csv-file-input')?.click();
    } else if (action === 'trigger-json-input') {
      document.getElementById('json-file-input')?.click();
    } else if (action === 'close-modal') {
      state.pendingImport = null;
      render();
    } else if (action === 'confirm-import') {
      await commitPendingImport();
    } else if (action === 'filter-category') {
      const cat = target.dataset.category || 'all';
      state.filters.category = state.filters.category === cat ? 'all' : cat;
      state.ledgerPage = 1;
      render();
    } else if (action === 'search-merchant') {
      state.filters.search = target.dataset.merchant || '';
      state.activeView = 'ledger';
      state.ledgerPage = 1;
      render();
    } else if (action === 'reset-filters') {
      state.filters = { ...state.filters, search: '', category: 'all', type: 'all' };
      state.ledgerPage = 1;
      render();
    } else if (action === 'set-decision') {
      const key = target.dataset.merchantKey;
      const decision = target.dataset.decision;
      if (key && decision) {
        state.workspace.decisions[key] = decision;
        await persist();
        render();
      }
    } else if (action === 'toggle-transfer') {
      const id = target.dataset.txId;
      const tx = state.workspace.transactions.find((t) => t.id === id);
      if (tx) {
        tx.isTransfer = !tx.isTransfer;
        tx.category = tx.isTransfer ? 'Transfers' : 'Other';
        await persist();
        render();
      }
    } else if (action === 'ledger-page') {
      state.ledgerPage = Math.max(1, Number(target.dataset.page) || 1);
      render();
    } else if (action === 'delete-rule') {
      const idx = Number(target.dataset.ruleIndex);
      if (Number.isInteger(idx)) {
        state.workspace.customRules.splice(idx, 1);
        await persist();
        render();
        showToast('Rule removed.');
      }
    } else if (action === 'export-csv') {
      const csv = exportTransactionsToCSV(state.workspace.transactions);
      downloadFile(csv, 'clearledger-transactions.csv', 'text/csv;charset=utf-8');
      showToast('Exported categorized CSV.');
    } else if (action === 'export-json') {
      downloadFile(JSON.stringify(state.workspace, null, 2), 'clearledger-backup.json', 'application/json');
      showToast('Downloaded JSON workspace backup.');
    } else if (action === 'print-report') {
      window.print();
    } else if (action === 'wipe-data') {
      await wipeWorkspace();
      state.workspace = structuredClone(DEFAULT_WORKSPACE);
      state.filters = { search: '', account: 'all', category: 'all', type: 'all', month: 'all' };
      state.activeView = 'overview';
      render();
      showToast('All local data erased.');
    }
  });

  document.addEventListener('change', async (event) => {
    const el = event.target;
    if (el.id === 'csv-file-input' && el.files?.[0]) {
      await handleCSVFile(el.files[0]);
      el.value = '';
      return;
    }
    if (el.id === 'json-file-input' && el.files?.[0]) {
      try {
        const text = await el.files[0].text();
        state.workspace = parseWorkspaceBackup(text);
        await persist();
        state.activeView = 'overview';
        render();
        showToast(`Restored ${state.workspace.transactions.length} transactions from backup.`);
      } catch (err) {
        showToast(err.message);
      }
      el.value = '';
      return;
    }
    if (el.dataset.filter) {
      state.filters[el.dataset.filter] = el.value;
      state.ledgerPage = 1;
      render();
      return;
    }
    if (el.dataset.mapperField && state.pendingImport) {
      const key = el.dataset.mapperField;
      if (key === 'accountName') {
        state.pendingImport.accountName = el.value;
      } else if (key === 'invertSign') {
        state.pendingImport.mapping.invertSign = el.checked;
      } else {
        state.pendingImport.mapping[key] = el.value;
      }
      render();
      return;
    }
    if (el.dataset.action === 'change-tx-category') {
      const tx = state.workspace.transactions.find((t) => t.id === el.dataset.txId);
      if (tx) {
        tx.category = el.value;
        tx.manualCategory = true;
        tx.isTransfer = el.value === 'Transfers';
        await persist();
        render();
        showToast(`Updated ${tx.merchant} to ${el.value}.`);
      }
      return;
    }
    if (el.dataset.action === 'update-budget') {
      const cat = el.dataset.category;
      const val = Number(el.value);
      if (cat) {
        if (!val || val <= 0) delete state.workspace.budgets[cat];
        else state.workspace.budgets[cat] = val;
        await persist();
        render();
      }
      return;
    }
    if (el.dataset.action === 'change-currency') {
      state.workspace.preferences.currency = el.value;
      await persist();
      render();
    }
  });

  document.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset.filter === 'search') {
      state.filters.search = el.value;
      state.ledgerPage = 1;
      render();
      const refreshed = document.getElementById('ledger-search-input');
      if (refreshed) {
        refreshed.focus();
        refreshed.setSelectionRange(refreshed.value.length, refreshed.value.length);
      }
    }
  });

  document.addEventListener('submit', async (event) => {
    if (event.target.id === 'rule-form') {
      event.preventDefault();
      const form = event.target;
      const pattern = form.elements.pattern.value.trim();
      const category = form.elements.category.value;
      if (!pattern) return;
      state.workspace.customRules.unshift({ pattern, category });
      state.workspace.transactions = applyRulesToTransactions(state.workspace.transactions, state.workspace.customRules);
      await persist();
      render();
      showToast(`Rule saved: "${pattern}" -> ${category}.`);
    }
  });

  // Global drag-and-drop CSV support
  document.addEventListener('dragover', (event) => {
    event.preventDefault();
    document.querySelectorAll('[data-dropzone="true"]').forEach((dz) => dz.classList.add('is-dragover'));
  });
  document.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) {
      document.querySelectorAll('[data-dropzone="true"]').forEach((dz) => dz.classList.remove('is-dragover'));
    }
  });
  document.addEventListener('drop', async (event) => {
    event.preventDefault();
    document.querySelectorAll('[data-dropzone="true"]').forEach((dz) => dz.classList.remove('is-dragover'));
    const file = event.dataTransfer?.files?.[0];
    if (file) await handleCSVFile(file);
  });

  // Keyboard shortcuts (1-5 views, / search, Escape close modal/drawer)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.pendingImport) {
        state.pendingImport = null;
        render();
      } else if (state.mobileNavOpen) {
        state.mobileNavOpen = false;
        render();
      }
      return;
    }
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (event.key === '/') {
      event.preventDefault();
      state.activeView = 'ledger';
      render();
      document.getElementById('ledger-search-input')?.focus();
    } else if (['1', '2', '3', '4', '5'].includes(event.key)) {
      const view = VIEWS[Number(event.key) - 1];
      if (view) {
        state.activeView = view.id;
        render();
      }
    }
  });
}

async function init() {
  attachGlobalListeners();
  state.workspace = await loadWorkspace();
  state.status = 'ready';
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Service worker registration is progressive enhancement
    });
  }
}

init();
