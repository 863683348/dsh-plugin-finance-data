# dsh-plugin-finance-data

面向 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) agent 的**金融数据工具包**：数字格式化、收益计算、估值与盈利比率、时间价值、风险指标，全部确定性计算。模型负责解读，插件负责算术。

## 安装

```bash
dsh plugin --profile <profile> add dsh-plugin-finance-data
```

重启 DSH 后，`finance_data` 工具全局注册。

## 工具

| 动作 | 用途 |
| --- | --- |
| `format` | 数字/货币/百分比格式化，千分位，中文万/亿单位 |
| `return` | 简单/对数/年化收益（CAGR 风格） |
| `ratio` | PE、PB、ROE、ROA、毛利率、净利率、产权比率 |
| `value` | 现值、终值、隐含收益率 |
| `risk` | 收益率序列的均值、波动率、最大回撤、历史 VaR(95)、夏普比率 |
| `checklist` | 数据质量清单（来源、时点、单位、口径） |

## 配置

均为可选项，写在组合行的 `config` 里：

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `personaSection` | `true` | 是否注册金融提示词段 |
| `sectionOrder` | `6` | 提示词段顺序（persona 为 0，升序） |

## 设计

纯逻辑（`lib/finance.js`）零 DSH/Cordis 依赖、可独立单测；`lib/index.js` 是薄 Cordis 壳。无文件系统访问，全部确定性、无副作用。

## License

MIT
