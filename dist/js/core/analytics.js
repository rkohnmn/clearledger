/**
 * Pure financial analytics engine: KPIs, monthly cashflow, category breakdowns,
 * budget pacing, merchant leaderboard, and subscription savings simulator.
 */

import { detectDuplicateCharges, detectRecurringCharges } from './recurring-detector.js';

/**
 * Filter transactions by active UI criteria.
 */
export function filterTransactions(transactions, filters = {}) {
  const { search = '', account = 'all', category = 'all', type = 'all', month = 'all' } = filters;
  const query = search.trim().toLowerCase();

  return transactions.filter((tx) => {
    if (account !== 'all' && tx.account !== account) return false;
    if (category !== 'all' && tx.category !== category) return false;
    if (month !== 'all' && tx.month !== month) return false;
    if (type === 'expense' && (tx.amount >= 0 || tx.isTransfer)) return false;
    if (type === 'income' && (tx.amount <= 0 || tx.isTransfer)) return false;
    if (type === 'transfer' && !tx.isTransfer) return false;
    if (query) {
      const hay = `${tx.merchant} ${tx.description} ${tx.category} ${tx.account} ${tx.date}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

/**
 * Compute full analytics view-model from transactions, budgets, and subscription decisions.
 */
export function computeAnalytics(transactions, options = {}) {
  const { decisions = {}, budgets = {}, accountFilter = 'all', monthFilter = 'all' } = options;

  const scoped = transactions.filter((tx) => {
    if (accountFilter !== 'all' && tx.account !== accountFilter) return false;
    if (monthFilter !== 'all' && tx.month !== monthFilter) return false;
    return true;
  });

  let totalIncome = 0;
  let totalExpenses = 0;
  let transferVolume = 0;
  let transferCount = 0;

  const monthlyMap = new Map();
  const categoryMap = new Map();
  const merchantMap = new Map();
  const accountsSet = new Set();
  const monthsSet = new Set();

  for (const tx of transactions) {
    accountsSet.add(tx.account);
    monthsSet.add(tx.month);
  }

  for (const tx of scoped) {
    if (tx.isTransfer) {
      transferVolume += Math.abs(tx.amount);
      transferCount += 1;
      continue;
    }

    if (!monthlyMap.has(tx.month)) {
      monthlyMap.set(tx.month, { month: tx.month, income: 0, expenses: 0, net: 0 });
    }
    const bucket = monthlyMap.get(tx.month);

    if (tx.amount > 0) {
      totalIncome += tx.amount;
      bucket.income += tx.amount;
    } else {
      const abs = Math.abs(tx.amount);
      totalExpenses += abs;
      bucket.expenses += abs;

      const catEntry = categoryMap.get(tx.category) || { category: tx.category, total: 0, count: 0 };
      catEntry.total += abs;
      catEntry.count += 1;
      categoryMap.set(tx.category, catEntry);

      const mKey = tx.merchant.toLowerCase();
      const merchEntry = merchantMap.get(mKey) || { merchant: tx.merchant, category: tx.category, total: 0, count: 0 };
      merchEntry.total += abs;
      merchEntry.count += 1;
      merchantMap.set(mKey, merchEntry);
    }
  }

  const monthlySeries = Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      income: round2(m.income),
      expenses: round2(m.expenses),
      net: round2(m.income - m.expenses),
    }));

  const monthCount = Math.max(monthlySeries.length, 1);

  const categories = Array.from(categoryMap.values())
    .map((c) => {
      const monthlyAvg = round2(c.total / monthCount);
      const budgetCap = budgets[c.category] ? Number(budgets[c.category]) : null;
      return {
        category: c.category,
        total: round2(c.total),
        count: c.count,
        share: totalExpenses > 0 ? round2((c.total / totalExpenses) * 100) : 0,
        monthlyAvg,
        budgetCap,
        budgetUtilization: budgetCap && budgetCap > 0 ? round2((monthlyAvg / budgetCap) * 100) : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  const topMerchants = Array.from(merchantMap.values())
    .map((m) => ({ ...m, total: round2(m.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Run recurring & duplicate detection across the full account-scoped history (ignoring single-month filter so cadence is accurate)
  const accountScoped = accountFilter === 'all'
    ? transactions
    : transactions.filter((tx) => tx.account === accountFilter);

  const { recurring, upcomingBills, priceHikes, referenceDate } = detectRecurringCharges(accountScoped, decisions);
  const duplicates = detectDuplicateCharges(scoped);

  const recurringMonthlyTotal = round2(recurring.reduce((sum, r) => sum + r.monthlyEquivalent, 0));
  const recurringAnnualTotal = round2(recurring.reduce((sum, r) => sum + r.annualCost, 0));
  const discretionarySubsMonthly = round2(
    recurring.filter((r) => !r.isEssential).reduce((sum, r) => sum + r.monthlyEquivalent, 0)
  );
  const potentialAnnualSavings = round2(
    recurring.filter((r) => r.decision === 'cancel').reduce((sum, r) => sum + r.annualCost, 0)
  );
  const reviewAnnualTotal = round2(
    recurring.filter((r) => r.decision === 'review').reduce((sum, r) => sum + r.annualCost, 0)
  );
  const keepAnnualTotal = round2(
    recurring.filter((r) => r.decision === 'keep').reduce((sum, r) => sum + r.annualCost, 0)
  );

  const netCashflow = round2(totalIncome - totalExpenses);
  const savingsRate = totalIncome > 0 ? round2((netCashflow / totalIncome) * 100) : 0;
  const upcoming30DayTotal = round2(upcomingBills.reduce((sum, b) => sum + b.latestAmount, 0));

  return {
    kpis: {
      totalIncome: round2(totalIncome),
      totalExpenses: round2(totalExpenses),
      netCashflow,
      savingsRate,
      avgMonthlySpend: round2(totalExpenses / monthCount),
      recurringMonthlyTotal,
      recurringAnnualTotal,
      discretionarySubsMonthly,
      potentialAnnualSavings,
      reviewAnnualTotal,
      keepAnnualTotal,
      upcoming30DayTotal,
      transferVolume: round2(transferVolume),
      transferCount,
      transactionCount: scoped.length,
      monthCount: monthlySeries.length,
    },
    monthlySeries,
    categories,
    topMerchants,
    recurring,
    upcomingBills,
    priceHikes,
    duplicates,
    referenceDate,
    accounts: Array.from(accountsSet).sort(),
    months: Array.from(monthsSet).sort().reverse(),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
