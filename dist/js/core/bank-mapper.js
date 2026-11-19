/**
 * Multi-bank CSV column auto-mapper and transaction normalizer.
 * Supports Chase, Amex, Capital One, Bank of America, Citi, Apple Card, YNAB/Mint, and generic CSVs.
 */

import { parseAmount, parseDate } from './csv-parser.js';
import { categorizeTransaction, isLikelyInternalTransfer, normalizeMerchant } from './categorizer.js';

export const BANK_PRESETS = [
  {
    id: 'chase',
    label: 'Chase (Checking / Card)',
    matchHeaders: ['Transaction Date', 'Description', 'Amount'],
    dateCol: ['Transaction Date', 'Posting Date'],
    descriptionCol: ['Description'],
    amountCol: ['Amount'],
    categoryCol: ['Category'],
    invertSign: false,
  },
  {
    id: 'amex',
    label: 'American Express',
    matchHeaders: ['Date', 'Description', 'Amount'],
    dateCol: ['Date'],
    descriptionCol: ['Description'],
    amountCol: ['Amount'],
    categoryCol: ['Category'],
    // Amex exports charges as positive numbers and credits as negative
    invertSign: true,
  },
  {
    id: 'capital_one',
    label: 'Capital One',
    matchHeaders: ['Transaction Date', 'Description', 'Debit', 'Credit'],
    dateCol: ['Transaction Date', 'Posted Date'],
    descriptionCol: ['Description'],
    debitCol: ['Debit'],
    creditCol: ['Credit'],
    categoryCol: ['Category'],
    invertSign: false,
  },
  {
    id: 'apple_card',
    label: 'Apple Card',
    matchHeaders: ['Transaction Date', 'Merchant', 'Amount (USD)'],
    dateCol: ['Transaction Date', 'Clearing Date'],
    descriptionCol: ['Merchant', 'Description'],
    amountCol: ['Amount (USD)'],
    categoryCol: ['Category'],
    invertSign: true,
  },
  {
    id: 'citi',
    label: 'Citi Credit Card',
    matchHeaders: ['Date', 'Description', 'Debit', 'Credit'],
    dateCol: ['Date'],
    descriptionCol: ['Description'],
    debitCol: ['Debit'],
    creditCol: ['Credit'],
    categoryCol: [],
    invertSign: false,
  },
  {
    id: 'ynab_mint',
    label: 'YNAB / Mint Export',
    matchHeaders: ['Date', 'Payee', 'Outflow', 'Inflow'],
    dateCol: ['Date'],
    descriptionCol: ['Payee', 'Description'],
    debitCol: ['Outflow'],
    creditCol: ['Inflow'],
    categoryCol: ['Category'],
    invertSign: false,
  },
];

function findColumn(headers, candidates) {
  const lowerMap = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  for (const name of candidates) {
    const exact = lowerMap.get(name.toLowerCase());
    if (exact) return exact;
  }
  return '';
}

function findColumnByRegex(headers, regex) {
  return headers.find((h) => regex.test(h)) || '';
}

/**
 * Inspect CSV headers and sample rows to infer the best column mapping.
 * @param {string[]} headers
 * @param {Record<string, string>[]} sampleRows
 */
export function detectColumnMapping(headers, sampleRows = []) {
  const lowerSet = new Set(headers.map((h) => h.toLowerCase().trim()));

  for (const preset of BANK_PRESETS) {
    const matchesAll = preset.matchHeaders.every((h) => lowerSet.has(h.toLowerCase()));
    if (matchesAll) {
      const mapping = {
        presetId: preset.id,
        presetLabel: preset.label,
        dateCol: findColumn(headers, preset.dateCol),
        descriptionCol: findColumn(headers, preset.descriptionCol),
        amountCol: preset.amountCol ? findColumn(headers, preset.amountCol) : '',
        debitCol: preset.debitCol ? findColumn(headers, preset.debitCol) : '',
        creditCol: preset.creditCol ? findColumn(headers, preset.creditCol) : '',
        categoryCol: preset.categoryCol ? findColumn(headers, preset.categoryCol) : '',
        invertSign: preset.invertSign,
      };
      // Disambiguate Amex (charges positive) vs generic (charges negative) when headers are just Date/Description/Amount
      if (preset.id === 'amex' && sampleRows.length > 0) {
        const amounts = sampleRows
          .slice(0, 25)
          .map((r) => parseAmount(r[mapping.amountCol]))
          .filter((n) => n !== null && n !== 0);
        const negatives = amounts.filter((n) => n < 0).length;
        const positives = amounts.filter((n) => n > 0).length;
        if (negatives > positives) {
          mapping.presetId = 'generic';
          mapping.presetLabel = 'Standard Bank CSV';
          mapping.invertSign = false;
        }
      }
      return mapping;
    }
  }

  // Heuristic fallback for unknown bank exports
  const dateCol = findColumnByRegex(headers, /(trans.*date|post.*date|date)/i) || headers[0] || '';
  const descriptionCol =
    findColumnByRegex(headers, /(description|merchant|payee|memo|narrative|details|name)/i) ||
    headers[1] ||
    '';
  const debitCol = findColumnByRegex(headers, /(debit|outflow|withdrawal|charge|spent)/i);
  const creditCol = findColumnByRegex(headers, /(credit|inflow|deposit|payment)/i);
  const amountCol =
    !debitCol && !creditCol
      ? findColumnByRegex(headers, /(amount|value|total|usd|eur|gbp)/i) || headers[2] || ''
      : '';
  const categoryCol = findColumnByRegex(headers, /(category|type|group)/i);

  return {
    presetId: 'generic',
    presetLabel: 'Auto-Detected CSV',
    dateCol,
    descriptionCol,
    amountCol,
    debitCol,
    creditCol,
    categoryCol,
    invertSign: false,
  };
}

/**
 * Convert parsed CSV rows into canonical ClearLedger transaction records.
 * Convention: Expenses are NEGATIVE numbers; Income/Refunds are POSITIVE numbers.
 */
export function normalizeRowsToTransactions(rows, mapping, options = {}) {
  const accountName = (options.accountName || 'Imported Account').trim() || 'Imported Account';
  const customRules = options.customRules || [];
  const transactions = [];
  const skipped = [];

  rows.forEach((row, index) => {
    const rawDate = row[mapping.dateCol] || '';
    const date = parseDate(rawDate);
    const rawDesc = (row[mapping.descriptionCol] || '').trim();

    let amount = null;
    if (mapping.debitCol || mapping.creditCol) {
      const debit = mapping.debitCol ? parseAmount(row[mapping.debitCol]) : null;
      const credit = mapping.creditCol ? parseAmount(row[mapping.creditCol]) : null;
      if (debit !== null && debit !== 0) {
        amount = -Math.abs(debit);
      } else if (credit !== null && credit !== 0) {
        amount = Math.abs(credit);
      } else if (debit === 0 || credit === 0) {
        amount = 0;
      }
    } else if (mapping.amountCol) {
      const rawAmount = parseAmount(row[mapping.amountCol]);
      if (rawAmount !== null) {
        amount = mapping.invertSign ? -rawAmount : rawAmount;
      }
    }

    if (!date || !rawDesc || amount === null || amount === 0) {
      skipped.push({ rowIndex: index + 1, reason: !date ? 'Invalid date' : !rawDesc ? 'Missing description' : 'Zero or invalid amount' });
      return;
    }

    const roundedAmount = Math.round(amount * 100) / 100;
    const merchant = normalizeMerchant(rawDesc);
    const rawCategory = mapping.categoryCol ? (row[mapping.categoryCol] || '').trim() : '';
    const isTransfer = isLikelyInternalTransfer(rawDesc, rawCategory);
    const category = isTransfer
      ? 'Transfers'
      : categorizeTransaction({ description: rawDesc, merchant, amount: roundedAmount, bankCategory: rawCategory }, customRules);

    const fingerprint = `${date}|${roundedAmount.toFixed(2)}|${merchant.toLowerCase()}|${accountName.toLowerCase()}`;

    transactions.push({
      id: hashFingerprint(fingerprint, index),
      fingerprint,
      date,
      month: date.slice(0, 7),
      description: rawDesc,
      merchant,
      amount: roundedAmount,
      account: accountName,
      category,
      isTransfer,
      source: options.isSample ? 'sample' : 'csv',
    });
  });

  return { transactions, skipped };
}

function hashFingerprint(str, fallbackIndex) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `tx_${(hash >>> 0).toString(36)}_${fallbackIndex.toString(36)}`;
}
