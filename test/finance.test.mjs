import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRatio,
  portfolioWeights,
  projectPlan,
  rebalance,
  computeReturn,
  dataChecklist,
  formatNumber,
  riskMetrics,
  valueMath,
} from "../lib/finance.js";

test("formatNumber thousands + decimals", () => {
  assert.equal(formatNumber({ value: 1234567.891, decimals: 2 }), "1,234,567.89");
});

test("formatNumber percent", () => {
  assert.equal(formatNumber({ value: 0.1234, percent: true, decimals: 2 }), "12.34%");
});

test("formatNumber currency", () => {
  assert.equal(formatNumber({ value: 42.5, currency: "$" }), "$42.50");
});

test("formatNumber Chinese wan/yi units", () => {
  assert.equal(formatNumber({ value: 12345, zh: true, decimals: 1 }), "1.2万");
  assert.equal(formatNumber({ value: 234000000, zh: true, decimals: 1 }), "2.3亿");
});

test("computeReturn simple and annualized", () => {
  const r = computeReturn({ start: 100, end: 121, periods: 2, annualized: true });
  assert.equal(r.simpleReturn, 0.21);
  assert.ok(Math.abs(r.annualizedReturn - 0.1) < 1e-9);
});

test("computeReturn log", () => {
  const r = computeReturn({ start: 100, end: 110, periods: 1, log: true });
  assert.ok(Math.abs(r.logReturn - Math.log(1.1)) < 1e-12);
});

test("computeRatio pe and roe", () => {
  assert.equal(computeRatio({ type: "pe", price: 50, eps: 2 }).value, 25);
  assert.equal(computeRatio({ type: "roe", netIncome: 10, equity: 200 }).value, 5);
});

test("computeRatio throws on zero denominators", () => {
  assert.throws(() => computeRatio({ type: "pe", price: 10, eps: 0 }), /eps != 0/);
});

test("valueMath fv and pv roundtrip", () => {
  const fv = valueMath({ mode: "fv", present: 1000, rate: 0.05, periods: 3 });
  const pv = valueMath({ mode: "pv", future: fv.value, rate: 0.05, periods: 3 });
  assert.ok(Math.abs(pv.value - 1000) < 1e-6);
});

test("valueMath implied rate", () => {
  const r = valueMath({ mode: "rate", present: 100, future: 121, periods: 2 });
  assert.ok(Math.abs(r.value - 0.1) < 1e-9);
});

test("riskMetrics computes stdev, drawdown, VaR, Sharpe", () => {
  const m = riskMetrics({ returns: [0.01, 0.02, -0.01, 0.03, -0.02], riskFree: 0 });
  assert.ok(Math.abs(m.mean - 0.006) < 1e-12);
  assert.ok(m.stdev > 0);
  assert.ok(m.maxDrawdown > 0 && m.maxDrawdown <= 1);
  assert.ok(m.var95 <= 0);
  assert.ok(Number.isFinite(m.sharpe));
});

test("riskMetrics rejects short series", () => {
  assert.throws(() => riskMetrics({ returns: [0.01] }), /at least 2/);
});

test("dataChecklist returns markdown list", () => {
  const out = dataChecklist();
  assert.ok(out.includes("As-of date"));
  assert.ok(out.includes("Units stated"));
});


test("projectPlan grows balance with contributions", () => {
  const plan = projectPlan({ principal: 10000, contribution: 1000, annualRate: 12, years: 1, contributionFrequency: "month", steps: 12 });
  assert.equal(plan.totalContributed, 12000);
  assert.ok(plan.final > 10000 + 12000, "final exceeds invested");
  assert.equal(plan.schedule.length, 12);
  assert.ok(plan.text.startsWith("# Projection"));
});

test("projectPlan zero-rate math", () => {
  const plan = projectPlan({ principal: 1000, contribution: 100, annualRate: 0, years: 1, steps: 12 });
  assert.equal(plan.final, 2200);
  assert.equal(plan.totalReturn, 0);
});

test("projectPlan applies inflation to real value", () => {
  const plan = projectPlan({ principal: 1000, contribution: 0, annualRate: 0, years: 1, inflation: 10, steps: 12 });
  assert.ok(plan.finalReal < plan.final, "real value below nominal with inflation");
});

test("projectPlan rejects bad inputs", () => {
  assert.throws(() => projectPlan({ principal: -1 }));
  assert.throws(() => projectPlan({ annualRate: -101 }));
});

test("portfolioWeights computes drift", () => {
  const w = portfolioWeights({ targets: { equity: 60, bond: 40 }, values: { equity: 70000, bond: 30000 } });
  assert.equal(w.totalValue, 100000);
  const eq = w.rows.find((r) => r.name === "equity");
  assert.equal(eq.actual, 70);
  assert.equal(eq.drift, 10);
});

test("portfolioWeights requires weights summing to 100", () => {
  assert.throws(() => portfolioWeights({ targets: { a: 50 } }));
  assert.throws(() => portfolioWeights({ targets: {} }));
});

test("rebalance issues buy/sell orders", () => {
  const r = rebalance({ targets: { equity: 60, bond: 40 }, values: { equity: 70000, bond: 30000 } });
  const eq = r.orders.find((o) => o.name === "equity");
  const bond = r.orders.find((o) => o.name === "bond");
  assert.equal(eq.action, "sell");
  assert.equal(eq.amount, 10000);
  assert.equal(bond.action, "buy");
  assert.equal(bond.amount, 10000);
});
