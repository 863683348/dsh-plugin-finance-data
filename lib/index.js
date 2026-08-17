/**
 * dsh-plugin-finance-data — a model-facing `finance_data` tool and finance
 * prompt guidance for DeepSeek Harness agents.
 *
 * A Cordis plugin: when the package is a profile layer (declares
 * `dsh.bundle.patch`), cordis.patch.yml inserts this row into the launcher
 * composition and the host runner loads this file. All logic is pure and
 * lives in ./finance.js; this module wires it up as a model tool.
 *
 * @module dsh-plugin-finance-data
 */
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  computeRatio,
  computeReturn,
  dataChecklist,
  formatNumber,
  riskMetrics,
  valueMath,
} from "./finance.js";

/** Cordis plugin name (registered with the loader). */
const name = "finance-data";

/** Services this plugin must resolve before it applies. */
const inject = ["tools", "systemPrompt"];

/** Composition-row configuration for the plugin entry. */
const Config = z.object({
  /** Register the finance prompt-guidance section. */
  personaSection: z.boolean().default(true),
  /** Order of the section (ascending; persona is 0). */
  sectionOrder: z.number().default(6),
});

const SECTION_TEXT = [
  "Finance data guidance:",
  "- Format figures with the `finance_data` tool action `format` (thousands separators, currency, percent, Chinese wan/yi units) instead of eyeballing decimals.",
  "- Do return math with `return` (simple / log / annualized), ratios with `ratio` (PE, PB, ROE, ROA, margins, debt-to-equity), and time value with `value` (PV / FV / implied rate).",
  "- For any return series, run `risk` to report volatility, max drawdown, historical VaR(95), and Sharpe alongside the mean.",
  "- Before presenting a figure, run `checklist` and state source, as-of date, units, and definitions.",
].join("\n");

function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name: "finance_data",
    description: "Finance-data helper: `format` (number/currency/percent formatting, optional Chinese wan/yi units), `return` (simple, log, and annualized returns), `ratio` (PE, PB, ROE, ROA, gross/net margin, debt-to-equity), `value` (present/future value and implied rate), `risk` (mean, volatility, max drawdown, historical VaR(95), Sharpe from a return series), `checklist` (data-quality checklist). Use it whenever the task involves financial figures, returns, valuations, or risk.",
    parameters: {
      action: {
        type: "string", required: true,
        enum: ["format", "return", "ratio", "value", "risk", "checklist"],
        description: "Which finance helper to run.",
      },
      value: { type: "number", description: "Number to format (format)." },
      decimals: { type: "integer", description: "Decimal places (format)." },
      thousands: { type: "boolean", description: "Thousands separators (format)." },
      currency: { type: "string", description: "Currency symbol prefix (format)." },
      percent: { type: "boolean", description: "Treat value as a fraction and render as percent (format)." },
      zh: { type: "boolean", description: "Use Chinese wan/yi units (format)." },
      start: { type: "number", description: "Starting value (return)." },
      end: { type: "number", description: "Ending value (return)." },
      periods: { type: "integer", description: "Number of periods for annualization (return)." },
      annualized: { type: "boolean", description: "Compute annualized return (return)." },
      log: { type: "boolean", description: "Also compute log return (return)." },
      type: { type: "string", description: "Ratio type: pe | pb | roe | roa | grossMargin | netMargin | debtToEquity (ratio)." },
      price: { type: "number", description: "Price per share (ratio pe/pb)." },
      eps: { type: "number", description: "Earnings per share (ratio pe)." },
      bvps: { type: "number", description: "Book value per share (ratio pb)." },
      netIncome: { type: "number", description: "Net income (ratio roe/roa/netMargin)." },
      equity: { type: "number", description: "Shareholders' equity (ratio roe/debtToEquity)." },
      assets: { type: "number", description: "Total assets (ratio roa)." },
      revenue: { type: "number", description: "Revenue (ratio grossMargin/netMargin)." },
      cogs: { type: "number", description: "Cost of goods sold (ratio grossMargin)." },
      debt: { type: "number", description: "Total debt (ratio debtToEquity)." },
      mode: { type: "string", description: "fv | pv | rate (value)." },
      present: { type: "number", description: "Present value (value)." },
      future: { type: "number", description: "Future value (value)." },
      rate: { type: "number", description: "Per-period rate (value)." },
      returns: { type: "array", items: { type: "number" }, description: "Return series as decimals, e.g. [0.01, -0.02] (risk)." },
      riskFree: { type: "number", description: "Risk-free rate for Sharpe (risk)." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: true,
        properties: {
          action: { type: "string", required: true },
          text: { type: "string" },
          value: { type: "number" },
          values: { type: "object" },
        },
      },
      render: (_args, value) => [{ type: "text", text: value.text ?? "" }],
    },
    execute: async (args) => {
      const action = args.action;
      let text = "";
      let value;
      let values;
      switch (action) {
        case "format":
          text = formatNumber({
            value: args.value, decimals: args.decimals, thousands: args.thousands,
            currency: args.currency, percent: args.percent, zh: args.zh,
          });
          break;
        case "return":
          values = computeReturn({
            start: args.start, end: args.end, periods: args.periods,
            annualized: args.annualized, log: args.log,
          });
          text = "simple return: " + formatNumber({ value: values.simpleReturn, percent: true, decimals: 4 })
            + (values.annualizedReturn !== undefined ? " | annualized: " + formatNumber({ value: values.annualizedReturn, percent: true, decimals: 4 }) : "")
            + (values.logReturn !== undefined ? " | log return: " + formatNumber({ value: values.logReturn, percent: true, decimals: 4 }) : "");
          break;
        case "ratio":
          values = computeRatio({
            type: args.type, price: args.price, eps: args.eps, bvps: args.bvps,
            netIncome: args.netIncome, equity: args.equity, assets: args.assets,
            revenue: args.revenue, cogs: args.cogs, debt: args.debt,
          });
          value = values.value;
          const isPct = ["roe", "roa", "grossMargin", "netMargin"].includes(args.type);
          text = values.type + " = " + formatNumber({ value, percent: isPct, decimals: 2, zh: true });
          break;
        case "value":
          values = valueMath({ mode: args.mode, present: args.present, future: args.future, rate: args.rate, periods: args.periods });
          value = values.value;
          text = args.mode + " = " + formatNumber({ value, decimals: 4 });
          break;
        case "risk":
          values = riskMetrics({ returns: args.returns, riskFree: args.riskFree });
          text = [
            "mean: " + formatNumber({ value: values.mean, percent: true, decimals: 4 }),
            "volatility (sample stdev): " + formatNumber({ value: values.stdev, percent: true, decimals: 4 }),
            "max drawdown: " + formatNumber({ value: values.maxDrawdown, percent: true, decimals: 2 }),
            "historical VaR(95): " + formatNumber({ value: values.var95, percent: true, decimals: 4 }),
            "Sharpe: " + (Number.isFinite(values.sharpe) ? values.sharpe.toFixed(3) : "n/a"),
            "samples: " + values.samples,
          ].join(" | ");
          break;
        case "checklist":
          text = dataChecklist();
          break;
        default:
          throw new Error("finance_data: unknown action '" + action + "'");
      }
      return { action, text, value, values };
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Finance data: " + args.action,
      kind: "other",
      rawInput: args,
    }),
  }));

  if (config.personaSection) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: "finance-data:instructions",
      order: config.sectionOrder,
      text: SECTION_TEXT,
    }), "finance-data.section()");
  }
}

export { Config, SECTION_TEXT, apply, inject, name };
