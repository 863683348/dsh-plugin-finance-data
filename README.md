# dsh-plugin-finance-data

A **finance data toolkit** for [DeepSeek Harness](https://github.com/deepseek-ai/dsh) agents: guaranteed-correct number formatting, return math, ratios, time value, and risk metrics. The model explains; the plugin does the arithmetic.

## Compatibility

Tool schemas are validated against the `@deepseek-ai/dsh-tools` value-schema DSL at plugin load (checked against dsh-tools 0.1.0-rc.6 and 0.1.1-rc.2). Earlier releases used JSON-Schema `required` at the root of `output.schema` and closed nested objects without declared properties, which made the host abort the whole profile boot with `unsupported JSON schema: schema.required is not supported by the value schema DSL` and could reject the tool's own results. Current releases fix both; if an affected version left your DSH unable to start, remove the plugin from the profile (or upgrade) — no data is lost.

## Install

```bash
dsh plugin --profile <profile> add dsh-plugin-finance-data
```

Restart DSH. The `finance_data` tool is registered host-wide.

## Tool

| action | purpose |
| --- | --- |
| `format` | Number/currency/percent formatting with thousands separators and Chinese 万/亿 units |
| `return` | Simple, log, and annualized (CAGR-style) returns |
| `ratio` | PE, PB, ROE, ROA, gross/net margin, debt-to-equity |
| `value` | Present value, future value, implied rate |
| `risk` | Mean, volatility, max drawdown, historical VaR(95), Sharpe from a return series |
| `checklist` | Data-quality checklist (source, as-of date, units, definitions) |
| `plan` | DCA / compound-interest projection — future value schedule, inflation-adjusted real value |
| `portfolio` | Portfolio weights, drift vs targets, and rebalance buy/sell orders |
| `trend` | Metric time series — mean, extremes, direction (slope), volatility |
| `peer` | Value vs peer group — P10/P50/P90 and percentile rank |

## Config

All optional, on the composition row's `config`:

| key | default | meaning |
| --- | --- | --- |
| `personaSection` | `true` | register the finance prompt-guidance section |
| `sectionOrder` | `6` | prompt section order (persona is 0, ascending) |

## Design

Pure logic (`lib/finance.js`) has zero DSH/Cordis imports and is unit-tested in isolation; `lib/index.js` is the thin Cordis plugin wiring the tool and the prompt section. No filesystem access — deterministic and side-effect free.

## License

MIT


## Roadmap

See [ROADMAP.md](./ROADMAP.md) — next five versions (v0.2.0 – v0.6.0): planning & portfolio, trends & peer comparison, cash-flow & sensitivity, bonds & FX/inflation, backtest & report export.
