/**
 * Perceptual-grade SVG data visualizations following Cleveland-McGill hierarchy:
 * - True zero baselines on every magnitude bar (Lie Factor = 1.00)
 * - Direct value labeling to eliminate legend eye-travel
 * - Subtle horizontal gridlines (<= 15% opacity)
 * - Redundant visual channels (color + position/pattern) for colorblind accessibility
 * - Dynamic takeaway-driven headlines
 */

import { CATEGORY_COLORS } from '../core/categorizer.js';
import { escapeHtml, formatCompactCurrency, formatCurrency, formatMonthLabel } from './formatters.js';

/**
 * Render Monthly Income vs. Expenses grouped bar chart with true zero baseline.
 */
export function renderCashflowChart(monthlySeries, currency = 'USD') {
  if (!monthlySeries || monthlySeries.length === 0) {
    return `<div class="chart-empty">Import a statement to compare monthly inflows and outflows.</div>`;
  }

  const width = 680;
  const height = 270;
  const pad = { top: 26, right: 16, bottom: 38, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxVal = Math.max(
    100,
    ...monthlySeries.map((m) => Math.max(m.income, m.expenses))
  );
  // Round Y-axis ceiling to a clean tick increment
  const step = niceTickStep(maxVal / 4);
  const yMax = Math.ceil(maxVal / step) * step;
  const ticks = [];
  for (let v = 0; v <= yMax + 0.001; v += step) {
    ticks.push(v);
  }

  const groupW = plotW / monthlySeries.length;
  const barW = Math.min(26, Math.max(10, groupW * 0.28));
  const barGap = Math.max(4, barW * 0.22);

  const gridLines = ticks
    .map((val) => {
      const y = pad.top + plotH - (val / yMax) * plotH;
      return `
        <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" class="chart-gridline" />
        <text x="${pad.left - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="chart-tick">${escapeHtml(formatCompactCurrency(val, currency))}</text>
      `;
    })
    .join('');

  const bars = monthlySeries
    .map((m, i) => {
      const cx = pad.left + i * groupW + groupW / 2;
      const incH = (m.income / yMax) * plotH;
      const expH = (m.expenses / yMax) * plotH;
      const incX = cx - barW - barGap / 2;
      const expX = cx + barGap / 2;
      const incY = pad.top + plotH - incH;
      const expY = pad.top + plotH - expH;
      const netLabel = `${m.net >= 0 ? '+' : ''}${formatCompactCurrency(m.net, currency)}`;
      const titleText = `${formatMonthLabel(m.month)}: Income ${formatCurrency(m.income, currency)}, Expenses ${formatCurrency(m.expenses, currency)}, Net ${formatCurrency(m.net, currency, { showPlus: true })}`;

      return `
        <g class="chart-month-group" tabindex="0" role="img" aria-label="${escapeHtml(titleText)}">
          <title>${escapeHtml(titleText)}</title>
          <rect x="${incX.toFixed(1)}" y="${incY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, incH).toFixed(1)}" rx="2" class="bar-income" />
          <rect x="${expX.toFixed(1)}" y="${expY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, expH).toFixed(1)}" rx="2" class="bar-expense" />
          <text x="${cx.toFixed(1)}" y="${(Math.min(incY, expY) - 6).toFixed(1)}" text-anchor="middle" class="chart-net-tag ${m.net >= 0 ? 'is-pos' : 'is-neg'}">${escapeHtml(netLabel)}</text>
          <text x="${cx.toFixed(1)}" y="${height - 14}" text-anchor="middle" class="chart-axis-label">${escapeHtml(formatMonthLabel(m.month))}</text>
        </g>
      `;
    })
    .join('');

  // Dynamic takeaway headline
  const totalInc = monthlySeries.reduce((s, m) => s + m.income, 0);
  const totalExp = monthlySeries.reduce((s, m) => s + m.expenses, 0);
  const surplusMonths = monthlySeries.filter((m) => m.net >= 0).length;
  const headline =
    totalInc === 0
      ? `Spending averaged ${formatCurrency(totalExp / monthlySeries.length, currency)}/month`
      : totalInc >= totalExp
        ? `Net surplus in ${surplusMonths} of ${monthlySeries.length} months (${formatCurrency(totalInc - totalExp, currency, { showPlus: true })} total)`
        : `Expenses exceeded income by ${formatCurrency(totalExp - totalInc, currency)} across ${monthlySeries.length} months`;

  return `
    <div class="chart-header">
      <div>
        <h3 class="chart-title">${escapeHtml(headline)}</h3>
        <p class="chart-subtitle">Monthly inflows vs. outflows (internal transfers excluded; net delta labeled above bars)</p>
      </div>
      <div class="chart-inline-key" aria-label="Chart series key">
        <span class="key-item"><span class="key-swatch swatch-income"></span>Inflow</span>
        <span class="key-item"><span class="key-swatch swatch-expense"></span>Outflow</span>
      </div>
    </div>
    <div class="chart-svg-wrap">
      <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Monthly cashflow bar chart">
        ${gridLines}
        <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}" class="chart-baseline" />
        ${bars}
      </svg>
    </div>
  `;
}

/**
 * Render sorted horizontal Category Spend bars with true zero baseline,
 * direct value/share labels, and optional monthly budget target marker.
 */
export function renderCategoryChart(categories, currency = 'USD', activeCategory = 'all', monthCount = 1) {
  if (!categories || categories.length === 0) {
    return `<div class="chart-empty">No expense categories found in the active filter.</div>`;
  }

  const top = categories.slice(0, 8);
  const maxVal = Math.max(
    10,
    ...top.map((c) => Math.max(c.total, c.budgetCap ? c.budgetCap * monthCount : 0))
  );
  const lead = top[0];
  const headline = `${lead.category} leads spending at ${formatCurrency(lead.total, currency)} (${lead.share.toFixed(0)}%)`;

  const rows = top
    .map((c) => {
      const pctWidth = Math.max(1.5, (c.total / maxVal) * 100);
      const color = CATEGORY_COLORS[c.category] || '#165B43';
      const isSelected = activeCategory === c.category;
      const capTotal = c.budgetCap ? c.budgetCap * monthCount : null;
      const capPos = capTotal ? Math.min(100, (capTotal / maxVal) * 100) : null;
      const isOver = capTotal !== null && c.total > capTotal;

      return `
        <button type="button" class="cat-bar-row ${isSelected ? 'is-selected' : ''}" data-action="filter-category" data-category="${escapeHtml(c.category)}" aria-pressed="${isSelected ? 'true' : 'false'}">
          <div class="cat-bar-meta">
            <span class="cat-bar-name">
              <span class="cat-dot" style="background:${color}"></span>
              ${escapeHtml(c.category)}
              ${isOver ? `<span class="cat-over-tag">Over cap</span>` : ''}
            </span>
            <span class="cat-bar-values mono">
              <strong>${escapeHtml(formatCurrency(c.total, currency))}</strong>
              <span class="cat-share">${c.share.toFixed(1)}%</span>
            </span>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill ${isOver ? 'is-over' : ''}" style="width:${pctWidth.toFixed(1)}%; background:${isOver ? 'var(--status-danger)' : color}"></div>
            ${capPos !== null ? `<span class="cat-cap-tick" style="left:${capPos.toFixed(1)}%" title="Budget cap: ${escapeHtml(formatCurrency(capTotal, currency))}"></span>` : ''}
          </div>
        </button>
      `;
    })
    .join('');

  return `
    <div class="chart-header">
      <div>
        <h3 class="chart-title">${escapeHtml(headline)}</h3>
        <p class="chart-subtitle">Sorted descending from true zero; click any category to filter the ledger${categories.some((c) => c.budgetCap) ? ' (vertical tick = budget cap)' : ''}</p>
      </div>
      ${activeCategory !== 'all' ? `<button type="button" class="btn btn-ghost btn-sm" data-action="filter-category" data-category="all">Clear filter</button>` : ''}
    </div>
    <div class="cat-bar-list">${rows}</div>
  `;
}

/**
 * Render 100% stacked bar illustrating subscription triage (Keep vs Review vs Cancel savings).
 */
export function renderSubscriptionTriageBar(kpis, currency = 'USD') {
  const total = kpis.recurringAnnualTotal;
  if (total <= 0) return '';

  const keepPct = (kpis.keepAnnualTotal / total) * 100;
  const reviewPct = (kpis.reviewAnnualTotal / total) * 100;
  const cancelPct = (kpis.potentialAnnualSavings / total) * 100;

  return `
    <div class="triage-bar-card">
      <div class="triage-bar-head">
        <span>Annual Recurring Allocation</span>
        <span class="mono"><strong>${escapeHtml(formatCurrency(total, currency))}/yr</strong> total</span>
      </div>
      <div class="triage-track" role="img" aria-label="Recurring charges breakdown: Keep ${keepPct.toFixed(0)}%, Review ${reviewPct.toFixed(0)}%, Cancel ${cancelPct.toFixed(0)}%">
        ${keepPct > 0 ? `<div class="triage-seg seg-keep" style="width:${keepPct.toFixed(2)}%"></div>` : ''}
        ${reviewPct > 0 ? `<div class="triage-seg seg-review" style="width:${reviewPct.toFixed(2)}%"></div>` : ''}
        ${cancelPct > 0 ? `<div class="triage-seg seg-cancel" style="width:${cancelPct.toFixed(2)}%"></div>` : ''}
      </div>
      <div class="triage-legend">
        <span><i class="dot-keep"></i>Keep: <strong class="mono">${escapeHtml(formatCurrency(kpis.keepAnnualTotal, currency))}</strong></span>
        <span><i class="dot-review"></i>Review: <strong class="mono">${escapeHtml(formatCurrency(kpis.reviewAnnualTotal, currency))}</strong></span>
        <span><i class="dot-cancel"></i>Cancel Savings: <strong class="mono">${escapeHtml(formatCurrency(kpis.potentialAnnualSavings, currency))}</strong></span>
      </div>
    </div>
  `;
}

function niceTickStep(rawStep) {
  if (rawStep <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const frac = rawStep / pow;
  if (frac <= 1.5) return 1 * pow;
  if (frac <= 3) return 2 * pow;
  if (frac <= 7) return 5 * pow;
  return 10 * pow;
}
