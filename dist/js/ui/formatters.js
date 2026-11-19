/**
 * Formatting utilities and strict HTML escaping for XSS prevention.
 */

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
  AUD: 'A$',
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCurrency(amount, currency = 'USD', options = {}) {
  const num = Number(amount) || 0;
  const sym = CURRENCY_SYMBOLS[currency] || '$';
  const sign = num < 0 ? '-' : options.showPlus && num > 0 ? '+' : '';
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: options.decimals ?? 2,
    maximumFractionDigits: options.decimals ?? 2,
  });
  return `${sign}${sym}${formatted}`;
}

export function formatCompactCurrency(amount, currency = 'USD') {
  const num = Number(amount) || 0;
  const sym = CURRENCY_SYMBOLS[currency] || '$';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${sym}${Math.round(abs)}`;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatMonthLabel(ym) {
  if (!ym || ym.length < 7) return ym || '';
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  return `${MONTH_SHORT[idx] || m} ${y.slice(2)}`;
}

export function formatDateShort(iso) {
  if (!iso || iso.length < 10) return iso || '';
  const [y, m, d] = iso.split('-');
  const idx = Number(m) - 1;
  return `${MONTH_SHORT[idx] || m} ${Number(d)}, ${y}`;
}
