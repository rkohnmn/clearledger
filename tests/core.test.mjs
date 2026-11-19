import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCSV, parseAmount, parseDate, detectDelimiter } from '../src/js/core/csv-parser.js';
import { detectColumnMapping, normalizeRowsToTransactions } from '../src/js/core/bank-mapper.js';
import { normalizeMerchant, isLikelyInternalTransfer, categorizeTransaction, applyRulesToTransactions } from '../src/js/core/categorizer.js';
import { detectRecurringCharges, detectDuplicateCharges } from '../src/js/core/recurring-detector.js';
import { computeAnalytics, filterTransactions } from '../src/js/core/analytics.js';
import { exportTransactionsToCSV, parseWorkspaceBackup } from '../src/js/core/storage.js';
import { createSampleDataset } from '../src/js/data/sample-dataset.js';
import { escapeHtml } from '../src/js/ui/formatters.js';

test('CSV Parser handles quoted fields, escaped quotes, BOM, and bank preamble rows', () => {
  const raw = '\uFEFFAccount Summary: Checking 4412\n\nTransaction Date,Description,Amount\n2026-10-01,"TRADER JOE\'S, ""EAST""",-84.25\n2026-10-02,ACME PAYROLL,2500.00\n';
  const parsed = parseCSV(raw);
  assert.equal(parsed.headers.length, 3);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].Description, 'TRADER JOE\'S, "EAST"');
  assert.equal(parsed.rows[0].Amount, '-84.25');
});

test('CSV Parser detects semicolon and tab delimiters', () => {
  assert.equal(detectDelimiter('Date;Description;Amount\n2026-10-01;Coffee;-4,50'), ';');
  assert.equal(detectDelimiter('Date\tDescription\tAmount\n2026-10-01\tCoffee\t-4.50'), '\t');
});

test('parseAmount handles US, accounting parentheses, DR/CR, and European decimals', () => {
  assert.equal(parseAmount('$1,234.56'), 1234.56);
  assert.equal(parseAmount('($45.99)'), -45.99);
  assert.equal(parseAmount('45.00 DR'), -45);
  assert.equal(parseAmount('-1.234,56 €'), -1234.56);
  assert.equal(parseAmount(''), null);
});

test('parseDate normalizes ISO, US, EU, and named-month formats', () => {
  assert.equal(parseDate('2026-10-14'), '2026-10-14');
  assert.equal(parseDate('10/14/2026'), '2026-10-14');
  assert.equal(parseDate('14/10/2026'), '2026-10-14');
  assert.equal(parseDate('Oct 14, 2026'), '2026-10-14');
  assert.equal(parseDate('14 Oct 2026'), '2026-10-14');
  assert.equal(parseDate('not-a-date'), null);
});

test('Bank Mapper detects Capital One split Debit/Credit and Amex positive charges', () => {
  const capOne = detectColumnMapping(['Transaction Date', 'Posted Date', 'Card No.', 'Description', 'Category', 'Debit', 'Credit']);
  assert.equal(capOne.presetId, 'capital_one');
  assert.equal(capOne.debitCol, 'Debit');
  assert.equal(capOne.creditCol, 'Credit');

  const amexRows = [
    { Date: '10/01/2026', Description: 'SPOTIFY USA', Amount: '16.99' },
    { Date: '10/05/2026', Description: 'TRADER JOES', Amount: '92.10' },
  ];
  const amex = detectColumnMapping(['Date', 'Description', 'Amount'], amexRows);
  assert.equal(amex.presetId, 'amex');
  assert.equal(amex.invertSign, true);

  const { transactions } = normalizeRowsToTransactions(amexRows, amex, { accountName: 'Amex Gold' });
  assert.equal(transactions.length, 2);
  assert.equal(transactions[0].amount, -16.99);
  assert.equal(transactions[0].category, 'Subscriptions');
});

test('Categorizer strips bank noise, detects internal transfers, and applies custom rules', () => {
  assert.equal(normalizeMerchant('POS DEBIT TRADER JOE S #142 US'), 'Trader Joe S');
  assert.equal(isLikelyInternalTransfer('CHASE CREDIT CRD AUTOPAY'), true);
  assert.equal(isLikelyInternalTransfer('ONLINE PAYMENT THANK YOU'), true);
  assert.equal(isLikelyInternalTransfer('WHOLE FOODS MARKET'), false);

  const customRules = [{ pattern: 'local roasters', category: 'Dining' }];
  const cat = categorizeTransaction({ description: 'LOCAL ROASTERS #04', merchant: 'Local Roasters', amount: -6.5 }, customRules);
  assert.equal(cat, 'Dining');
});

test('Recurring Detector identifies monthly cadences, price hikes, and upcoming bills in sample dataset', () => {
  const sample = createSampleDataset();
  assert.ok(sample.length > 100);

  const { recurring, priceHikes, upcomingBills } = detectRecurringCharges(sample, {
    'streamflix.com monthly': 'cancel',
  });

  assert.ok(recurring.length >= 10, `Expected >= 10 recurring charges, got ${recurring.length}`);
  const stream = recurring.find((r) => r.merchant.toLowerCase().includes('streamflix'));
  assert.ok(stream, 'StreamFlix should be detected as recurring');
  assert.equal(stream.cadence, 'monthly');
  assert.equal(stream.decision, 'cancel');
  assert.ok(stream.priceHike, 'StreamFlix price hike ($15.49 -> $17.99) must be flagged');
  assert.equal(stream.priceHike.previousAmount, 15.49);
  assert.equal(stream.priceHike.newAmount, 17.99);

  assert.ok(priceHikes.length >= 2, 'Both StreamFlix and CloudVault price hikes should be detected');
  assert.ok(upcomingBills.length > 0, 'Upcoming 30-day bills should be forecasted');
});

test('Duplicate Detector catches identical same-account charges within 3 days', () => {
  const sample = createSampleDataset();
  const duplicates = detectDuplicateCharges(sample);
  assert.equal(duplicates.length, 1);
  assert.match(duplicates[0].merchant, /Blue Bottle/i);
  assert.equal(duplicates[0].amount, 7.45);
});

test('Analytics excludes internal transfers from spend and calculates cancel savings accurately', () => {
  const sample = createSampleDataset();
  const analytics = computeAnalytics(sample, {
    decisions: { 'streamflix.com monthly': 'cancel' },
  });

  assert.ok(analytics.kpis.transferCount >= 24, '24 internal transfer rows across 6 months should be excluded');
  assert.ok(analytics.kpis.totalIncome > 30000);
  assert.ok(analytics.kpis.totalExpenses > 15000);
  assert.equal(analytics.kpis.potentialAnnualSavings, 215.88);
  assert.equal(analytics.monthlySeries.length, 6);

  const filtered = filterTransactions(sample, { search: 'streamflix' });
  assert.equal(filtered.length, 6);
});

test('CSV export, JSON backup round-trip, and XSS escaping work cleanly', () => {
  const sample = createSampleDataset().slice(0, 5);
  const csv = exportTransactionsToCSV(sample);
  assert.ok(csv.startsWith('Date,Account,Merchant,Description,Category,Type,Amount'));
  const reparsed = parseCSV(csv);
  assert.equal(reparsed.rows.length, 5);

  const backup = parseWorkspaceBackup(JSON.stringify({ transactions: sample, customRules: [{ pattern: 'foo', category: 'Other' }] }));
  assert.equal(backup.transactions.length, 5);
  assert.equal(backup.customRules.length, 1);

  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});
