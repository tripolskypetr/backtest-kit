<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/decart.svg" height="45px" align="right">

# 📊 @backtest-kit/ui

> Full-stack UI framework for visualizing cryptocurrency trading signals, backtests, and real-time market data. Combines a Node.js backend server with a React dashboard - all in one package.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/ui.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/ui)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Interactive dashboard for backtest-kit with signal visualization, candle charts, risk analysis, and notification management. Built with React 18, Material-UI, and Lightweight Charts.

📚 **[Backtest Kit Docs](https://backtest-kit.github.io/documents/example_02_first_backtest.html)** | 🌟 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

## ✨ Features

- 📈 **Interactive Charts**: Candlestick visualization with Lightweight Charts (1m, 15m, 1h timeframes)
- 🎯 **Signal Tracking**: View opened, closed, scheduled, and cancelled signals with full details
- 📊 **Risk Analysis**: Monitor risk rejections and position management
- 🔔 **Notifications**: Real-time notification system for all trading events
- 💹 **Trailing & Breakeven**: Visualize trailing stop/take and breakeven events
- 🌐 **Multi-Exchange**: Support for 100+ exchanges via CCXT integration
- 🎨 **Material Design**: Beautiful UI with MUI 5 and Mantine components
- 🌍 **i18n Ready**: Internationalization support built-in

## 📋 What It Does

`@backtest-kit/ui` provides both backend API and frontend dashboard:

| Component | Description |
|-----------|-------------|
| **`serve()`** | Start HTTP server with REST API endpoints |
| **`getRouter()`** | Get expressjs-compatible router for custom middleware integration |

## 🚀 Installation

```bash
npm install @backtest-kit/ui backtest-kit ccxt
```

## 📖 Usage

### Quick Start - Launch Dashboard

```typescript
import { serve } from '@backtest-kit/ui';

// Start the UI server
serve('0.0.0.0', 60050);

// Dashboard available at http://localhost:60050
```

### Custom Logger Integration

```typescript
import { setLogger } from '@backtest-kit/ui';

setLogger({
  log: (msg) => console.log(`[UI] ${msg}`),
  warn: (msg) => console.warn(`[UI] ${msg}`),
  error: (msg) => console.error(`[UI] ${msg}`),
});
```

## 📐 Dashboard Revenue Math

The **Revenue** metrics on the dashboard are calculated in **dollar terms**, assuming a fixed position size of **$100 per DCA entry**.

### Dollar PnL formula

```
dollar_pnl = pnlPercentage × totalEntries
```

| `totalEntries` | Effective position | Dollar PnL (example: +5%) |
|:--------------:|-------------------:|-------------------------:|
| 1 | $100 | +$5.00 |
| 2 | $200 | +$10.00 |
| 3 | $300 | +$15.00 |

- **`pnlPercentage`** — percentage PnL as stored in the signal (e.g. `5` = 5 %). It does **not** change with DCA averaging.
- **`totalEntries`** — number of DCA buy entries that were executed for the signal (`IPublicSignalRow.totalEntries`). A regular (non-DCA) signal has `totalEntries = 1`, so the formula degrades to the plain percentage.
- **Fallback** — if `totalEntries` is `0` or absent (legacy data), the raw `pnlPercentage` is used as-is.

This scaling is applied to all time-window revenue fields: *today*, *yesterday*, *7 days*, and *31 days*.

## 🖥️ Dashboard Views

The frontend provides specialized views for different trading events:

| View | Description |
|------|-------------|
| **Signal Opened** | Entry details with chart visualization |
| **Signal Closed** | Exit details with PnL analysis |
| **Signal Scheduled** | Pending orders awaiting activation |
| **Signal Cancelled** | Cancelled orders with reasons |
| **Risk Rejection** | Signals rejected by risk management |
| **Partial Profit/Loss** | Partial position closures |
| **Trailing Stop/Take** | Trailing adjustments visualization |
| **Breakeven** | Breakeven level adjustments |

Each view includes:
- 📋 Detailed information form
- 📈 1m, 15m, 1h candlestick charts
- 📥 JSON export for all data

## 💡 Why Use @backtest-kit/ui?

Instead of building custom dashboards:

**Without backtest-kit**

```typescript
// ❌ Without @backtest-kit/ui
// Build your own React app
// Implement chart components
// Create signal visualization
// Handle notifications
// Write API endpoints
// ... weeks of development
```

**With backtest-kit**

```typescript
// ✅ With @backtest-kit/ui
import { serve } from '@backtest-kit/ui';

serve(); // Full dashboard ready!
```

**Benefits:**

- 📊 Production-ready trading dashboard out of the box
- 📈 Professional chart visualization with price lines and markers
- 🔔 Complete notification system for all trading events
- 🎨 Beautiful Material Design interface
- ⚡ Fast development - focus on strategy, not UI
- 🛡️ Full TypeScript support

## 🤝 Contribute

Fork/PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
