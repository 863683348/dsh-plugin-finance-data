# dsh-plugin-finance-data 路线图（Roadmap）

> 基线：**v0.1.0**（已发布 npm / 已挂 vertical-toolkits profile）
> 范围：接下来 5 个版本 **v0.2.0 → v0.6.0**
> 规划原则：数值正确性优先（有公式即单测）；纯逻辑模块可单测、无副作用；文件类能力走 `ctx.fs` + containment 校验。

## 版本总览

| 版本 | 主题 | 关键交付 |
|---|---|---|
| v0.2.0 | 规划与组合 | `plan` 定投/复利模拟 + `portfolio` 组合权重与再平衡 |
| v0.3.0 | 趋势与对比 | `trend` 比率历史趋势 + `peer` 同业分位数对比 |
| v0.4.0 | 预测与情景 | `cashflow` 现金流预测 + `sensitivity` 敏感性分析 |
| v0.5.0 | 固收与汇率 | `bond` 债券定价/久期 + `fx` 汇率与通胀调整 |
| v0.6.0 | 回测与报告 | `backtest` 策略回测 + `report` 投资分析报告导出 |

## v0.2.0（下一个版本）— 规划与组合

### 新增动作
- `plan`：定投/复利模拟——
  - 期初本金 + 定期投入（月/季/年）+ 年化收益率 + 期限 → 终值、累计投入、收益、时间表
  - 支持按复利频率（年/月/日）与通胀调整显示实际购买力
- `portfolio`：组合权重与再平衡——
  - 目标权重 + 当前市值 → 实际权重、漂移、再平衡指令（买/卖金额）
  - 可输出调整后持仓表

### 实现位置
- `lib/finance.js`：新增 `projectPlan` / `portfolioWeights` / `rebalance` 纯函数
- `lib/index.js`：注册 2 个新 action 到 `finance_data` 工具

### 验收标准
- [ ] `node --check` 通过
- [ ] 新增单测 ≥ 8 个（复利公式、定投序列、权重归一、漂移阈值、边界：0 本金/负收益率）
- [ ] 原有 6 个 action 单测全绿
- [ ] README（en/zh）更新
- [ ] vertical-toolkits dump-config 正常

## v0.3.0 — 趋势与对比

- `trend`：财务比率时间序列分析（均值/极值/方向/波动）
- `peer`：单公司指标 ↔ 同业分布分位数对比（P10/P50/P90）

## v0.4.0 — 预测与情景

- `cashflow`：收入/支出序列 → 月度结余、累计现金流、缺口预警
- `sensitivity`：关键变量（增速/利率/汇率）what-if 敏感性表

## v0.5.0 — 固收与汇率

- `bond`：债券价格、到期收益率（YTM，迭代求解）、久期/凸性
- `fx`：汇率换算、跨币种收益率、通胀调整（实际收益）

## v0.6.0 — 回测与报告

- `backtest`：简单规则策略回测（定投/均线等）vs 基准，输出收益/波动/最大回撤/夏普
- `report`：投资分析报告（组合、计划、风险指标汇总）Markdown 导出

## 发布节奏

每个版本完成后走完整 dsh-factory 流程：本地验证 → npm publish → GitHub topic → awesome PR。
