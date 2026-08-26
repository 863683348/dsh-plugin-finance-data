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
import { TOOL_SPEC } from "./tool-spec.js";


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
  "- For savings/investing questions, project DCA growth with `plan` and check portfolio drift with `portfolio` (weights + rebalance orders).",
].join("\n");

function apply(ctx, config) {
  ctx.tools.register(defineTool(TOOL_SPEC));

  if (config.personaSection) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: "finance-data:instructions",
      order: config.sectionOrder,
      text: SECTION_TEXT,
    }), "finance-data.section()");
  }
}

export { Config, SECTION_TEXT, apply, inject, name };
