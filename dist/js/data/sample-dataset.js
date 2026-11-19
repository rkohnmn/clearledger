/**
 * Deterministic, clearly labeled 6-month Sample Household Ledger (May–Oct 2026)
 * spanning 3 accounts so first-time users can evaluate ClearLedger immediately
 * before importing their own bank CSVs.
 */

import { normalizeRowsToTransactions } from '../core/bank-mapper.js';

const MONTHS = [
  { ym: '2026-05', label: 'May' },
  { ym: '2026-06', label: 'Jun' },
  { ym: '2026-07', label: 'Jul' },
  { ym: '2026-08', label: 'Aug' },
  { ym: '2026-09', label: 'Sep' },
  { ym: '2026-10', label: 'Oct' },
];

export function createSampleDataset() {
  const checkingRows = [];
  const everydayCardRows = [];
  const travelCardRows = [];

  MONTHS.forEach(({ ym }, idx) => {
    // Biweekly payroll deposits
    checkingRows.push(
      { Date: `${ym}-01`, Description: 'ACH CREDIT ACME INDUSTRIAL PAYROLL', Amount: '2850.00' },
      { Date: `${ym}-15`, Description: 'ACH CREDIT ACME INDUSTRIAL PAYROLL', Amount: '2850.00' }
    );

    // Fixed housing & utilities
    checkingRows.push(
      { Date: `${ym}-02`, Description: 'AVALONBAY APARTMENTS LEASE PMT', Amount: '-1925.00' },
      { Date: `${ym}-08`, Description: 'PPL ELECTRIC UTILITIES AUTOPAY', Amount: `-${(118 + (idx % 3) * 14).toFixed(2)}` },
      { Date: `${ym}-12`, Description: 'VERIZON FIOS INTERNET BILL', Amount: '-79.99' },
      { Date: `${ym}-19`, Description: 'GEICO AUTO INS MONTHLY', Amount: '-134.50' }
    );

    // Internal credit card payments (should be detected as Transfers and excluded from spending)
    checkingRows.push(
      { Date: `${ym}-24`, Description: 'CHASE CREDIT CRD AUTOPAY', Amount: '-1240.00' },
      { Date: `${ym}-25`, Description: 'AMEX EPAYMENT ACH PMT', Amount: '-360.00' }
    );
    everydayCardRows.push(
      { Date: `${ym}-24`, Description: 'ONLINE PAYMENT THANK YOU', Amount: '1240.00' }
    );
    travelCardRows.push(
      { Date: `${ym}-25`, Description: 'ONLINE PAYMENT THANK YOU', Amount: '360.00' }
    );

    // Subscriptions with 2 realistic silent price hikes:
    // 1. StreamFlix rises $15.49 -> $17.99 starting Sep 2026
    // 2. CloudVault 2TB rises $9.99 -> $11.99 starting Oct 2026
    const streamPrice = idx >= 4 ? 17.99 : 15.49;
    const cloudPrice = idx >= 5 ? 11.99 : 9.99;

    everydayCardRows.push(
      { Date: `${ym}-04`, Description: 'STREAMFLIX.COM MONTHLY', Amount: `-${streamPrice.toFixed(2)}` },
      { Date: `${ym}-06`, Description: 'SPOTIFY USA DUO PLAN', Amount: '-16.99' },
      { Date: `${ym}-09`, Description: 'CLOUDVAULT 2TB STORAGE', Amount: `-${cloudPrice.toFixed(2)}` },
      { Date: `${ym}-11`, Description: 'NYTIMES DIGITAL SUBSCRIPTION', Amount: '-17.00' },
      { Date: `${ym}-14`, Description: 'PLANET FITNESS CLUB DUES', Amount: '-24.99' },
      { Date: `${ym}-18`, Description: 'OPENAI CHATGPT PLUS', Amount: '-20.00' },
      { Date: `${ym}-21`, Description: 'ADOBE CREATIVE CLOUD', Amount: '-59.99' },
      { Date: `${ym}-26`, Description: '1PASSWORD FAMILY PLAN', Amount: '-4.99' }
    );

    // Groceries
    everydayCardRows.push(
      { Date: `${ym}-03`, Description: 'TRADER JOE S #142', Amount: `-${(128.4 + idx * 4.2).toFixed(2)}` },
      { Date: `${ym}-10`, Description: 'WEGMANS FOOD MARKET #084', Amount: `-${(156.2 - idx * 3.1).toFixed(2)}` },
      { Date: `${ym}-17`, Description: 'TRADER JOE S #142', Amount: `-${(114.8 + (idx % 2) * 19.5).toFixed(2)}` },
      { Date: `${ym}-24`, Description: 'WHOLE FOODS MARKET', Amount: `-${(96.3 + idx * 5.4).toFixed(2)}` }
    );

    // Dining & Coffee
    everydayCardRows.push(
      { Date: `${ym}-05`, Description: 'BLUE BOTTLE COFFEE', Amount: '-7.45' },
      { Date: `${ym}-13`, Description: 'SWEETGREEN SALADS', Amount: '-18.60' },
      { Date: `${ym}-20`, Description: 'LOCAL BISTRO KITCHEN', Amount: `-${(68.5 + (idx % 3) * 12).toFixed(2)}` },
      { Date: `${ym}-27`, Description: 'DOORDASH*RAMEN HOUSE', Amount: `-${(34.2 + (idx % 2) * 8.5).toFixed(2)}` }
    );

    // Transport & Health & Shopping
    everydayCardRows.push(
      { Date: `${ym}-07`, Description: 'SHELL OIL 57442', Amount: `-${(44.2 + (idx % 3) * 4.5).toFixed(2)}` },
      { Date: `${ym}-16`, Description: 'CVS/PHARMACY #0412', Amount: `-${(22.8 + (idx % 2) * 9.4).toFixed(2)}` },
      { Date: `${ym}-22`, Description: 'AMAZON.COM*MKTP US', Amount: `-${(64.5 + idx * 14.3).toFixed(2)}` }
    );

    // Occasional travel / shopping on Travel Visa
    travelCardRows.push(
      { Date: `${ym}-14`, Description: 'AMTRAK RAIL TICKET', Amount: `-${(54.0 + (idx % 2) * 18).toFixed(2)}` },
      { Date: `${ym}-23`, Description: 'TARGET STORE #1821', Amount: `-${(72.4 + (idx % 3) * 15).toFixed(2)}` }
    );
  });

  // Add one realistic duplicate charge in Oct 2026 for the duplicate alert engine
  everydayCardRows.push({
    Date: '2026-10-06',
    Description: 'BLUE BOTTLE COFFEE',
    Amount: '-7.45',
  });

  // Add a summer trip & freelance income spike for realistic cashflow variation
  travelCardRows.push(
    { Date: '2026-07-11', Description: 'DELTA AIR LINES TICKET', Amount: '-418.00' },
    { Date: '2026-07-12', Description: 'MARRIOTT DOWNTOWN HOTEL', Amount: '-512.00' }
  );
  checkingRows.push(
    { Date: '2026-08-20', Description: 'STRIPE PAYOUT FREELANCE CONSULTING', Amount: '850.00' }
  );

  const mapping = {
    dateCol: 'Date',
    descriptionCol: 'Description',
    amountCol: 'Amount',
    debitCol: '',
    creditCol: '',
    categoryCol: '',
    invertSign: false,
  };

  const t1 = normalizeRowsToTransactions(checkingRows, mapping, { accountName: 'Primary Checking', isSample: true }).transactions;
  const t2 = normalizeRowsToTransactions(everydayCardRows, mapping, { accountName: 'Everyday Rewards Card', isSample: true }).transactions;
  const t3 = normalizeRowsToTransactions(travelCardRows, mapping, { accountName: 'Travel Visa', isSample: true }).transactions;

  return [...t1, ...t2, ...t3].sort((a, b) => b.date.localeCompare(a.date));
}
