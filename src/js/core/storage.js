/**
 * Local-first persistence adapter using IndexedDB with safe localStorage fallback.
 * Also handles JSON workspace backup/restore and RFC 4180 CSV export.
 */

const DB_NAME = 'clearledger_db_v1';
const STORE_NAME = 'workspace';
const WORKSPACE_KEY = 'state_v1';
const FALLBACK_KEY = 'clearledger_workspace_v1';

export const DEFAULT_WORKSPACE = {
  version: 1,
  isSample: false,
  transactions: [],
  customRules: [],
  decisions: {},
  budgets: {
    Groceries: 650,
    Dining: 300,
    Shopping: 250,
    Subscriptions: 180,
    Transport: 220,
  },
  preferences: {
    theme: 'light',
    currency: 'USD',
  },
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function loadWorkspace() {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(WORKSPACE_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(mergeWithDefaults(req.result));
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return loadFallback();
  }
}

export async function saveWorkspace(workspace) {
  const payload = {
    version: 1,
    isSample: Boolean(workspace.isSample),
    transactions: Array.isArray(workspace.transactions) ? workspace.transactions : [],
    customRules: Array.isArray(workspace.customRules) ? workspace.customRules : [],
    decisions: workspace.decisions || {},
    budgets: workspace.budgets || {},
    preferences: workspace.preferences || DEFAULT_WORKSPACE.preferences,
  };

  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(payload, WORKSPACE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    saveFallback(payload);
  }
}

export async function wipeWorkspace() {
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Fallback wipe handled below
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(FALLBACK_KEY);
  }
}

function loadFallback() {
  if (typeof localStorage === 'undefined') return structuredClone(DEFAULT_WORKSPACE);
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return structuredClone(DEFAULT_WORKSPACE);
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_WORKSPACE);
  }
}

function saveFallback(payload) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(payload));
  } catch {
    // Storage quota exceeded; caller continues in memory
  }
}

function mergeWithDefaults(stored) {
  if (!stored || typeof stored !== 'object') {
    return structuredClone(DEFAULT_WORKSPACE);
  }
  return {
    ...structuredClone(DEFAULT_WORKSPACE),
    ...stored,
    budgets: { ...DEFAULT_WORKSPACE.budgets, ...(stored.budgets || {}) },
    preferences: { ...DEFAULT_WORKSPACE.preferences, ...(stored.preferences || {}) },
  };
}

/**
 * Serialize transactions into a clean RFC 4180 CSV string for spreadsheet export.
 */
export function exportTransactionsToCSV(transactions) {
  const headers = ['Date', 'Account', 'Merchant', 'Description', 'Category', 'Type', 'Amount'];
  const escapeCell = (val) => {
    const str = String(val ?? '');
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(',')];
  for (const tx of transactions) {
    const type = tx.isTransfer ? 'Transfer' : tx.amount >= 0 ? 'Income' : 'Expense';
    lines.push(
      [
        tx.date,
        tx.account,
        tx.merchant,
        tx.description,
        tx.category,
        type,
        tx.amount.toFixed(2),
      ]
        .map(escapeCell)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

/**
 * Validate and parse an imported JSON backup file.
 */
export function parseWorkspaceBackup(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Invalid JSON backup file.', { cause: err });
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.transactions)) {
    throw new Error('Backup file is missing a valid transactions array.');
  }
  return mergeWithDefaults(parsed);
}
