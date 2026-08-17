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
