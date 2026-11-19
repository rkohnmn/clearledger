/**
 * Merchant normalization, internal transfer detection, and rule-based categorization.
 */

export const CATEGORIES = [
  'Housing',
  'Groceries',
  'Dining',
  'Subscriptions',
  'Utilities',
  'Transport',
  'Shopping',
  'Health',
  'Travel',
  'Entertainment',
  'Income',
  'Transfers',
  'Other',
];

export const CATEGORY_COLORS = {
  Housing: '#165B43',
  Groceries: '#2A7B5F',
  Dining: '#B85D19',
  Subscriptions: '#1E568E',
  Utilities: '#4C6B7A',
  Transport: '#6B5B8D',
  Shopping: '#9A6700',
  Health: '#A8385D',
  Travel: '#2E7D8A',
  Entertainment: '#7A543E',
  Income: '#1A7F37',
  Transfers: '#6B7280',
  Other: '#5F635D',
};

const TRANSFER_PATTERNS = [
  /\b(autopay|auto\s*pay)\b.*\b(card|chase|amex|citi|capital\s*one|discover|visa|mastercard)\b/i,
  /\b(payment\s+thank\s+you|online\s+payment\s+thank\s+you|credit\s+card\s+payment|card\s+payment)\b/i,
  /\b(transfer\s+(to|from)\s+(checking|savings|brokerage|card)|internal\s+transfer|ach\s+transfer\s+internal)\b/i,
  /\b(chase\s+credit\s+crd|amex\s+epayment|citi\s+card\s+online|capital\s+one\s+mobile\s+pmt)\b/i,
];

const BUILTIN_RULES = [
  { category: 'Income', pattern: /\b(payroll|direct\s*dep|salary|paycheck|employer\s*inc|dividend|interest\s+paid|tax\s+refund|freelance\s+payout|stripe\s+payout)\b/i },
  { category: 'Housing', pattern: /\b(rent|mortgage|property\s+mgmt|apartments?|hoa\s+dues|avalonbay|equity\s+residential|lease\s+pmt)\b/i },
  { category: 'Utilities', pattern: /\b(electric|power|water\s+util|gas\s+co|comcast|xfinity|verizon\s+fios|at&t\s+fiber|t-mobile|verizon\s+wireless|internet|sewer|trash|coned|pg&e|ppl\s+electric)\b/i },
  { category: 'Subscriptions', pattern: /\b(netflix|streamflix|spotify|apple\.com\/bill|icloud|cloudvault|google\s+one|youtube\s+premium|hulu|disney\+|max\.com|hbo|adobe|figma|github|notion|openai|chatgpt|claude|dropbox|1password|nytimes|wsj|audible|kindle\s+unlimited|amazon\s+prime|peloton|gym|planet\s+fitness|equinox|substack|patreon|proton|linkedin\s+premium|microsoft\s*365)\b/i },
  { category: 'Groceries', pattern: /\b(trader\s*joe|whole\s*foods|kroger|safeway|publix|aldi|wegmans|costco\s+whse|sprouts|h-e-b|giant\s+food|stop\s*&\s*shop|market\s+basket|fresh\s+market|instacart|grocery|supermarket)\b/i },
  { category: 'Dining', pattern: /\b(coffee|cafe|starbucks|blue\s+bottle|chipotle|sweetgreen|panera|doordash|ubereats|grubhub|restaurant|bistro|kitchen|grill|pizza|sushi|bakery|diner|ramen|taco|burger|bar\s+&\s+grill|brewery)\b/i },
  { category: 'Transport', pattern: /\b(uber\s*(?!eats)|lyft|shell\s+oil|chevron|exxon|mobil|bp\s+gas|sunoco|wawa\s+fuel|ez-?pass|metro|mta|septa|bart|transit|parking|garage|amtrak|auto\s+ins|geico|progressive|state\s+farm)\b/i },
  { category: 'Health', pattern: /\b(cvs|walgreens|rite\s+aid|pharmacy|dental|dentist|clinic|hospital|medical|optometry|therapy|quest\s+diag|labcorp|copay|health\s+ins)\b/i },
  { category: 'Travel', pattern: /\b(delta\s+air|united\s+air|american\s+air|southwest|jetblue|airbnb|marriott|hilton|hyatt|hotel|resort|hertz|enterprise\s+rent|expedia|booking\.com)\b/i },
  { category: 'Shopping', pattern: /\b(amazon\.com|amzn\s+mktp|target|walmart|best\s+buy|apple\s+store|ikea|home\s+depot|lowe'?s|uniqlo|nordstrom|nike|rei|etsy|sephora|chewy|ace\s+hardware)\b/i },
  { category: 'Entertainment', pattern: /\b(amc\s+theatre|regal\s+cinema|ticketmaster|stubhub|steam\s+games|playstation|nintendo|xbox|museum|concert|bowling|cinema)\b/i },
];

/**
 * Strip bank noise prefixes, store numbers, card suffixes, and trailing codes
 * so recurring charges from the same merchant group reliably.
 * @param {string} rawDescription
 * @returns {string}
 */
export function normalizeMerchant(rawDescription) {
  let clean = String(rawDescription || '').trim();

  // Remove common bank prefixes
  clean = clean
    .replace(/^(POS\s+DEBIT|DEBIT\s+CARD\s+PURCHASE|ACH\s+DEBIT|ACH\s+CREDIT|RECURRING\s+CARD\s+PURCHASE|CHECKCARD|PURCHASE\s+AUTHORIZED\s+ON\s+\d{2}\/\d{2}|SQ\s*\*|TST\*\s*|PAYPAL\s*\*|SP\s+)/i, '')
    .replace(/\b(XX+\d{2,4}|\*{2,}\d{2,4})\b/g, '')
    .replace(/#\s*\d+\b/g, '')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/\s+\b(US|USA|CA|NY|PA|TX|WA|FL|IL|MA|NJ)\b\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-*:\s]+|[-*:\s]+$/g, '');

  if (!clean) return String(rawDescription || 'Unknown Merchant').trim();

  // Preserve readable capitalization for all-caps bank strings
  if (clean === clean.toUpperCase() && clean.length > 3) {
    clean = clean
      .toLowerCase()
      .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase())
      .replace(/\b(At&t|Cvs|Amc|Hbo|Nytimes|Wsj|Rei|Ikea|Mta|Ppl)\b/gi, (m) => m.toUpperCase());
  }

  return clean;
}

/**
 * Detect whether a transaction is an internal credit-card payment or account transfer
 * so multi-account imports do not double-count spending.
 */
export function isLikelyInternalTransfer(description, bankCategory = '') {
  if (/^(transfer|credit card payment|payment)$/i.test(bankCategory.trim())) {
    return true;
  }
  return TRANSFER_PATTERNS.some((rx) => rx.test(description));
}

/**
 * Categorize a transaction using user-defined custom rules first, then built-in patterns,
 * then bank-supplied category fallback.
 */
export function categorizeTransaction(tx, customRules = []) {
  const haystack = `${tx.description || ''} ${tx.merchant || ''}`;

  for (const rule of customRules) {
    if (!rule || !rule.pattern || !rule.category) continue;
    const needle = rule.pattern.trim().toLowerCase();
    if (needle.length > 0 && haystack.toLowerCase().includes(needle)) {
      return rule.category;
    }
  }

  if (tx.amount > 0) {
    if (BUILTIN_RULES[0].pattern.test(haystack)) return 'Income';
    // Small positive amounts on cards are usually refunds; keep merchant category if matched
    for (let i = 1; i < BUILTIN_RULES.length; i += 1) {
      if (BUILTIN_RULES[i].pattern.test(haystack)) return BUILTIN_RULES[i].category;
    }
    return 'Income';
  }

  for (let i = 1; i < BUILTIN_RULES.length; i += 1) {
    if (BUILTIN_RULES[i].pattern.test(haystack)) {
      return BUILTIN_RULES[i].category;
    }
  }

  // Fallback to normalized bank-provided category if present
  if (tx.bankCategory) {
    const mapped = mapBankCategory(tx.bankCategory);
    if (mapped) return mapped;
  }

  return 'Other';
}

function mapBankCategory(raw) {
  const s = raw.toLowerCase();
  if (/grocer|supermarket/.test(s)) return 'Groceries';
  if (/food|dining|restaurant|drink/.test(s)) return 'Dining';
  if (/housing|rent|mortgage/.test(s)) return 'Housing';
  if (/util|telecom|internet|phone/.test(s)) return 'Utilities';
  if (/subscrip|software|streaming|media/.test(s)) return 'Subscriptions';
  if (/gas|auto|transport|transit|parking/.test(s)) return 'Transport';
  if (/health|medical|pharmacy|wellness/.test(s)) return 'Health';
  if (/travel|airline|lodging|hotel/.test(s)) return 'Travel';
  if (/shop|merchandise|retail|home/.test(s)) return 'Shopping';
  if (/entertain|recreation/.test(s)) return 'Entertainment';
  if (/income|salary|pay/.test(s)) return 'Income';
  return null;
}

/**
 * Re-apply custom categorization rules across an existing transaction array.
 */
export function applyRulesToTransactions(transactions, customRules = []) {
  return transactions.map((tx) => {
    if (tx.manualCategory) return tx;
    if (tx.isTransfer) return { ...tx, category: 'Transfers' };
    const matched = customRules.find((r) => {
      const needle = (r.pattern || '').trim().toLowerCase();
      return needle && (`${tx.description} ${tx.merchant}`).toLowerCase().includes(needle);
    });
    if (matched) {
      return {
        ...tx,
        category: matched.category,
        isTransfer: matched.category === 'Transfers',
      };
    }
    return tx;
  });
}
