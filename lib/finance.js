/**
 * dsh-plugin-finance-data — pure finance math and formatting helpers.
 *
 * No DSH or Cordis imports here, so this module is unit-testable in
 * isolation. The model fetches and explains; these helpers guarantee the
 * arithmetic and formatting are right.
 */

/** Format a number with separators, currency, percent, and Chinese units. */
export function formatNumber({ value, decimals = 2, thousands = true, currency = "", percent = false, zh = false } = {}) {
  const v = Number(value);
  if (!Number.isFinite(v)) throw new Error("finance: value must be a finite number");
  let out;
  if (percent) {
    out = (v * 100).toFixed(Math.max(0, Math.floor(decimals))) + "%";
  } else if (zh && Math.abs(v) >= 1e8) {
    out = (v / 1e8).toFixed(Math.max(0, Math.floor(decimals))) + "亿";
  } else if (zh && Math.abs(v) >= 1e4) {
    out = (v / 1e4).toFixed(Math.max(0, Math.floor(decimals))) + "万";
  } else {
    out = v.toFixed(Math.max(0, Math.floor(decimals)));
    if (thousands) out = out.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  return (currency ? currency + out : out);
}

/** Return math: simple, log, and annualized (CAGR-style) returns. */
export function computeReturn({ start, end, periods = 1, annualized = false, log = false } = {}) {
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) throw new Error("finance: start and end must be finite numbers");
  if (s === 0) throw new Error("finance: start cannot be zero");
  const n = Math.max(1, Math.floor(periods));
  if (log) return { logReturn: Math.log(e / s) / n, simpleReturn: (e - s) / s };
  const simple = (e - s) / s;
  const annualizedValue = annualized && n > 1 ? Math.pow(1 + simple, 1 / n) - 1 : undefined;
  const out = { simpleReturn: simple };
  if (annualizedValue !== undefined) out.annualizedReturn = annualizedValue;
  return out;
}

/** Valuation / profitability ratios (values in the same unit as inputs). */
export function computeRatio({ type = "pe", price, eps, bvps, netIncome, equity, assets, revenue, cogs, debt } = {}) {
  const ratio = {
    pe: () => { if (price == null || eps == null || eps === 0) throw new Error("finance: pe needs price and eps (eps != 0)"); return price / eps; },
    pb: () => { if (price == null || bvps == null || bvps === 0) throw new Error("finance: pb needs price and bvps (bvps != 0)"); return price / bvps; },
    roe: () => { if (netIncome == null || equity == null || equity === 0) throw new Error("finance: roe needs netIncome and equity (equity != 0)"); return (netIncome / equity) * 100; },
    roa: () => { if (netIncome == null || assets == null || assets === 0) throw new Error("finance: roa needs netIncome and assets (assets != 0)"); return (netIncome / assets) * 100; },
    grossMargin: () => { if (revenue == null || cogs == null || revenue === 0) throw new Error("finance: grossMargin needs revenue and cogs (revenue != 0)"); return ((revenue - cogs) / revenue) * 100; },
    netMargin: () => { if (netIncome == null || revenue == null || revenue === 0) throw new Error("finance: netMargin needs netIncome and revenue (revenue != 0)"); return (netIncome / revenue) * 100; },
    debtToEquity: () => { if (debt == null || equity == null || equity === 0) throw new Error("finance: debtToEquity needs debt and equity (equity != 0)"); return debt / equity; },
  }[type];
  if (!ratio) throw new Error("finance: unknown ratio type '" + type + "'");
  return { type, value: ratio() };
}

/** Present/future value, and implied rate when both are given. */
export function valueMath({ mode = "fv", present, future, rate, periods } = {}) {
  const p = present != null ? Number(present) : NaN;
  const f = future != null ? Number(future) : NaN;
  const r = Number(rate);
  const n = Number(periods);
  if (mode === "rate") {
    if (!Number.isFinite(n) || n <= 0) throw new Error("finance: rate needs finite periods > 0");
  } else if (!Number.isFinite(r) || !Number.isFinite(n) || n < 0) {
    throw new Error("finance: value needs finite rate and non-negative periods");
  }
  if (mode === "fv") {
    if (!Number.isFinite(p)) throw new Error("finance: fv needs present");
    return { mode, value: p * Math.pow(1 + r, n) };
  }
  if (mode === "pv") {
    if (!Number.isFinite(f)) throw new Error("finance: pv needs future");
    return { mode, value: f / Math.pow(1 + r, n) };
  }
  if (mode === "rate") {
    if (!Number.isFinite(p) || !Number.isFinite(f) || p === 0 || n === 0) throw new Error("finance: rate needs present, future, and periods > 0");
    return { mode, value: Math.pow(f / p, 1 / n) - 1 };
  }
  throw new Error("finance: unknown mode '" + mode + "'");
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Basic risk metrics from a series of period returns (decimals, e.g. 0.01). */
export function riskMetrics({ returns = [], riskFree = 0 } = {}) {
  if (!Array.isArray(returns) || returns.length < 2) throw new Error("finance: risk needs at least 2 returns");
  const rs = returns.map(Number);
  if (rs.some((x) => !Number.isFinite(x))) throw new Error("finance: returns must be finite numbers");
  const n = rs.length;
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  const variance = rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const stdev = Math.sqrt(variance);
  let peak = 1;
  let maxDrawdown = 0;
  let cum = 1;
  for (const r of rs) {
    cum *= 1 + r;
    if (cum > peak) peak = cum;
    const dd = (peak - cum) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const sorted = [...rs].sort((a, b) => a - b);
  const var95 = percentile(sorted, 0.05);
  const sharpe = stdev === 0 ? NaN : (mean - Number(riskFree)) / stdev;
  return { mean, stdev, maxDrawdown, var95, sharpe, samples: n };
}

/** Static data-quality checklist for any financial figure. */
export function dataChecklist() {
  const items = [
    "Source identified (exchange, provider, filing) and cited",
    "As-of date / period attached — no stale figures presented as current",
    "Units stated (currency, shares, thousands/millions, % vs decimal)",
    "Seasonality / one-off items flagged where relevant",
    "FX basis stated for cross-currency numbers",
    "Definition of each ratio matches the context (TTM vs annual, GAAP vs non-GAAP)",
  ];
  return "Financial data checklist:\n- " + items.join("\n- ");
}

function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** DCA / compound-interest projection with optional inflation adjustment. */
export function projectPlan({ principal = 0, contribution = 0, contributionFrequency = "month", annualRate = 0, years = 1, inflation = 0, steps = 12 } = {}) {
  const p = Number(principal) || 0;
  const c = Number(contribution) || 0;
  const r = Number(annualRate) || 0;
  const yrs = Math.max(0.1, Number(years) || 0);
  const inf = Number(inflation) || 0;
  if (p < 0 || c < 0) throw new Error("finance: principal and contribution must be non-negative");
  if (r < -100) throw new Error("finance: annualRate must be >= -100");
  const perYear = contributionFrequency === "year" ? 1 : contributionFrequency === "week" ? 52 : contributionFrequency === "quarter" ? 4 : 12;
  const n = Math.max(1, Math.floor(steps));
  const perPeriod = r / (perYear * 100);
  const periods = Math.max(1, Math.round(yrs * perYear));
  const total = Math.min(periods, n);
  let balance = p;
  const schedule = [];
  for (let i = 1; i <= total; i++) {
    balance = balance * (1 + perPeriod) + c;
    const nominal = balance;
    const real = nominal / Math.pow(1 + inf / 100, i / perYear);
    schedule.push({ period: i, balance: round2(nominal), real: round2(real) });
  }
  const final = balance;
  const invested = p + c * total;
  const totalReturn = final - invested;
  const finalReal = final / Math.pow(1 + inf / 100, total / perYear);
  const text = [
    "# Projection",
    "",
    "Principal: " + round2(p) + ", contribution: " + round2(c) + "/" + contributionFrequency + ", annual rate: " + r + "%, years: " + yrs + (inf > 0 ? ", inflation: " + inf + "%" : ""),
    "",
    "| Period | Balance | Real (after inflation) |",
    "|--------|---------|------------------------|",
    ...schedule.map((s) => "| " + s.period + " | " + s.balance + " | " + s.real + " |"),
    "",
    "Invested: " + round2(invested) + ", final: " + round2(final) + ", return: " + round2(totalReturn) + " (" + (invested > 0 ? round2((totalReturn / invested) * 100) : 0) + "%)",
    "Final real value: " + round2(finalReal),
  ].join("\n");
  return { principal: round2(p), contributionPerPeriod: round2(c), totalContributed: round2(c * total), invested: round2(invested), final: round2(final), finalReal: round2(finalReal), totalReturn: round2(totalReturn), returnPct: invested > 0 ? round2((totalReturn / invested) * 100) : 0, schedule, text };
}

/** Portfolio actual weights and drift vs target weights. */
export function portfolioWeights({ targets = {}, values = {} } = {}) {
  const names = Object.keys(targets);
  if (names.length === 0) throw new Error("finance: target weights are required");
  const totalTarget = names.reduce((s, n) => s + (Number(targets[n]) || 0), 0);
  if (Math.abs(totalTarget - 100) > 1e-6) throw new Error("finance: target weights must sum to 100");
  const totalValue = names.reduce((s, n) => s + (Number(values[n]) || 0), 0);
  const rows = names.map((n) => {
    const target = Number(targets[n]) || 0;
    const value = Number(values[n]) || 0;
    const actual = totalValue > 0 ? (value / totalValue) * 100 : 0;
    return { name: n, target, value: round2(value), actual: round2(actual), drift: round2(actual - target) };
  });
  const text = [
    "# Portfolio weights",
    "",
    "Total value: " + round2(totalValue),
    "",
    "| Asset | Target % | Value | Actual % | Drift |",
    "|-------|----------|-------|----------|-------|",
    ...rows.map((r) => "| " + r.name + " | " + r.target + " | " + r.value + " | " + r.actual + " | " + r.drift + " |"),
  ].join("\n");
  return { totalValue: round2(totalValue), rows, text };
}

/** Rebalance orders to bring the portfolio back to target weights. */
export function rebalance({ targets = {}, values = {} } = {}) {
  const base = portfolioWeights({ targets, values });
  const orders = base.rows.map((r) => {
    const desired = (r.target / 100) * base.totalValue;
    const diff = desired - r.value;
    return { name: r.name, targetValue: round2(desired), diff: round2(diff), action: diff >= 0 ? "buy" : "sell", amount: round2(Math.abs(diff)) };
  });
  const text = [
    "# Rebalance orders",
    "",
    "| Asset | Target value | Current | Action | Amount |",
    "|-------|--------------|---------|--------|--------|",
    ...orders.map((o) => "| " + o.name + " | " + o.targetValue + " | " + o.diff + " | " + o.action + " | " + o.amount + " |"),
  ].join("\n");
  return { orders, text };
}