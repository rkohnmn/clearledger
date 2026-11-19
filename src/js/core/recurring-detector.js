/**
 * Algorithmic recurring subscription/bill detector, silent price-hike alert engine,
 * 30-day upcoming bill forecaster, and duplicate-charge detector.
 */

const DAY_MS = 86_400_000;

function daysBetween(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

function addDays(isoDate, days) {
  const ts = Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS;
  return new Date(ts).toISOString().slice(0, 10);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function classifyCadence(medianGap) {
  if (medianGap >= 5 && medianGap <= 9) return { id: 'weekly', label: 'Weekly', annualFactor: 52, nominalDays: 7 };
  if (medianGap >= 12 && medianGap <= 17) return { id: 'biweekly', label: 'Biweekly', annualFactor: 26, nominalDays: 14 };
  if (medianGap >= 25 && medianGap <= 36) return { id: 'monthly', label: 'Monthly', annualFactor: 12, nominalDays: 30 };
  if (medianGap >= 80 && medianGap <= 102) return { id: 'quarterly', label: 'Quarterly', annualFactor: 4, nominalDays: 91 };
  if (medianGap >= 350 && medianGap <= 380) return { id: 'annual', label: 'Annual', annualFactor: 1, nominalDays: 365 };
  return null;
}

const FIXED_BILL_CATEGORIES = new Set(['Subscriptions', 'Housing', 'Utilities']);
const VARIABLE_RETAIL_CATEGORIES = new Set(['Groceries', 'Dining', 'Shopping', 'Travel', 'Entertainment', 'Health']);

/**
 * Detect recurring bills & subscriptions from normalized transactions.
 * Distinguishes fixed-tier subscriptions/bills from variable retail merchants
 * (e.g. regular grocery stores) to avoid false-positive subscription or price-hike alerts.
 *
 * @param {Array<object>} transactions
 * @param {Record<string, string>} [decisions] Map of merchantKey -> 'keep' | 'review' | 'cancel'
 */
export function detectRecurringCharges(transactions, decisions = {}) {
  const expenses = transactions
    .filter((tx) => tx.amount < 0 && !tx.isTransfer)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (expenses.length === 0) {
    return { recurring: [], upcomingBills: [], priceHikes: [], referenceDate: null };
  }

  const referenceDate = expenses[expenses.length - 1].date;
  const byMerchant = new Map();

  for (const tx of expenses) {
    const key = tx.merchant.toLowerCase();
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push(tx);
  }

  const recurring = [];
  const priceHikes = [];

  for (const [merchantKey, list] of byMerchant.entries()) {
    if (list.length < 2) continue;

    // Exclude same-day or near-duplicate charges when measuring cadence intervals
    const dedupedByDate = [];
    for (const tx of list) {
      const prev = dedupedByDate[dedupedByDate.length - 1];
      if (!prev || daysBetween(prev.date, tx.date) >= 4) {
        dedupedByDate.push(tx);
      }
    }
    if (dedupedByDate.length < 2) continue;

    const gaps = [];
    for (let i = 1; i < dedupedByDate.length; i += 1) {
      gaps.push(daysBetween(dedupedByDate[i - 1].date, dedupedByDate[i].date));
    }

    const medGap = median(gaps);
    const cadence = classifyCadence(medGap);
    if (!cadence) continue;

    const consistentGaps = gaps.filter(
      (g) => Math.abs(g - cadence.nominalDays) <= Math.max(5, cadence.nominalDays * 0.2)
    );
    const intervalScore = consistentGaps.length / gaps.length;
    if (intervalScore < 0.65) continue;

    const amounts = dedupedByDate.map((tx) => Math.abs(tx.amount));
    const latestAmount = amounts[amounts.length - 1];
    const avgAmount = amounts.reduce((sum, v) => sum + v, 0) / amounts.length;
    const maxDev = Math.max(...amounts.map((v) => Math.abs(v - avgAmount) / Math.max(avgAmount, 1)));

    const category = dedupedByDate[dedupedByDate.length - 1].category;
    const isFixedCategory = FIXED_BILL_CATEGORIES.has(category);
    const isVariableRetail = VARIABLE_RETAIL_CATEGORIES.has(category);

    // Variable retail categories (groceries, dining, shopping, etc.) are only recurring if strictly flat-rate
    if (isVariableRetail && maxDev > 0.02) continue;
    if (!isFixedCategory && !isVariableRetail && maxDev > 0.08) continue;
    if (isFixedCategory && maxDev > 0.35) continue;

    // Detect silent price hike: prior charges were stable (flat baseline), then stepped up >= $0.50 and >= 3%
    let priceHike = null;
    if (category !== 'Utilities' && amounts.length >= 3) {
      const earlier = amounts.slice(0, -1);
      const baseline = median(earlier);
      const stableBaselineCount = earlier.filter((v) => Math.abs(v - baseline) < 0.05).length;
      const hasStableBaseline = stableBaselineCount >= Math.max(2, Math.floor(earlier.length * 0.6));

      if (
        hasStableBaseline &&
        latestAmount - baseline >= 0.5 &&
        (latestAmount - baseline) / baseline >= 0.03
      ) {
        const firstHikeIdx = amounts.findIndex((v) => v - baseline >= 0.5);
        priceHike = {
          previousAmount: round2(baseline),
          newAmount: round2(latestAmount),
          delta: round2(latestAmount - baseline),
          percentIncrease: round2(((latestAmount - baseline) / baseline) * 100),
          detectedDate: dedupedByDate[firstHikeIdx >= 0 ? firstHikeIdx : dedupedByDate.length - 1].date,
        };
      }
    }

    const lastDate = dedupedByDate[dedupedByDate.length - 1].date;
    let nextExpectedDate = addDays(lastDate, cadence.nominalDays);
    if (
      daysBetween(referenceDate, nextExpectedDate) < -5 &&
      daysBetween(lastDate, referenceDate) <= cadence.nominalDays * 1.6
    ) {
      nextExpectedDate = addDays(nextExpectedDate, cadence.nominalDays);
    }

    const monthlyEquivalent = round2((latestAmount * cadence.annualFactor) / 12);
    const annualCost = round2(latestAmount * cadence.annualFactor);
    const confidence = Math.min(0.99, round2(0.55 + intervalScore * 0.25 + (1 - Math.min(maxDev, 0.5)) * 0.2));
    const decision = decisions[merchantKey] || 'keep';

    const entry = {
      merchantKey,
      merchant: dedupedByDate[dedupedByDate.length - 1].merchant,
      category,
      account: dedupedByDate[dedupedByDate.length - 1].account,
      cadence: cadence.id,
      cadenceLabel: cadence.label,
      occurrences: dedupedByDate.length,
      latestAmount: round2(latestAmount),
      monthlyEquivalent,
      annualCost,
      lastDate,
      nextExpectedDate,
      confidence,
      isEssential: ['Housing', 'Utilities', 'Health'].includes(category),
      priceHike,
      decision,
    };

    recurring.push(entry);
    if (priceHike) {
      priceHikes.push({
        merchant: entry.merchant,
        merchantKey,
        category: entry.category,
        ...priceHike,
        annualImpact: round2(priceHike.delta * cadence.annualFactor),
      });
    }
  }

  recurring.sort((a, b) => b.annualCost - a.annualCost);
  priceHikes.sort((a, b) => b.annualImpact - a.annualImpact);

  const upcomingBills = recurring
    .filter((item) => {
      const daysUntil = daysBetween(referenceDate, item.nextExpectedDate);
      return daysUntil >= 0 && daysUntil <= 31 && item.decision !== 'cancel';
    })
    .map((item) => ({
      ...item,
      daysUntil: daysBetween(referenceDate, item.nextExpectedDate),
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil);

  return { recurring, upcomingBills, priceHikes, referenceDate };
}

/**
 * Detect potential duplicate charges: identical merchant & amount within 3 calendar days
 * on the same account (excluding transfers).
 */
export function detectDuplicateCharges(transactions) {
  const expenses = transactions
    .filter((tx) => tx.amount < 0 && !tx.isTransfer)
    .sort((a, b) => a.date.localeCompare(b.date));

  const duplicates = [];
  const seenPairs = new Set();

  for (let i = 0; i < expenses.length; i += 1) {
    const curr = expenses[i];
    for (let j = i + 1; j < expenses.length; j += 1) {
      const next = expenses[j];
      const gap = daysBetween(curr.date, next.date);
      if (gap > 3) break;
      if (
        curr.merchant.toLowerCase() === next.merchant.toLowerCase() &&
        Math.abs(curr.amount - next.amount) < 0.01 &&
        curr.account === next.account
      ) {
        const pairKey = `${curr.id}:${next.id}`;
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          duplicates.push({
            id: pairKey,
            merchant: curr.merchant,
            account: curr.account,
            amount: round2(Math.abs(curr.amount)),
            firstDate: curr.date,
            secondDate: next.date,
            daysApart: gap,
            category: curr.category,
          });
        }
      }
    }
  }

  return duplicates;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
