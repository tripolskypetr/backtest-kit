<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 📊 BTCUSDT October 2021 — TensorFlow Neural Network Strategy

> Machine learning-based strategy that uses a TensorFlow neural network to predict next candle close prices.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Build](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml/badge.svg)](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml)

The strategy trains a simple feed-forward neural network (8→6→4→1 architecture) on normalized candle data every 8 hours. It predicts where the next candle will close within its high-low range. When current price is below the predicted price, it opens a $100 position via `Position.moonbag` with 1% hard stop. Positions close automatically via trailing take profit when profit retraces by 1% from peak.

**Strategy:** `oct_2021_strategy` | **Exchange:** `ccxt-exchange` | **Frame:** `oct_2021_frame`

## 🧠 Neural Network Architecture

```
Input Layer:    8 neurons (8 normalized candles)
Hidden Layer 1: 6 neurons (ReLU activation, He Normal init)
Hidden Layer 2: 4 neurons (ReLU activation, He Normal init)
Output Layer:   1 neuron  (Sigmoid activation, outputs [0,1])
```

**Training Parameters:**
- Optimizer: Adam (learning rate 0.01)
- Loss: Mean Squared Error
- Epochs: 100
- Batch size: 32
- Validation split: 20%

**Normalization:** Each candle is normalized as `(close - low) / (high - low)`, mapping the close position within the candle's range to [0, 1].

## 📉 Price Context (October 2021)

| Metric | Value |
|---|---|
| Frame start | Oct 1, 2021 |
| Frame end | Oct 14, 2021 |
| Period | **13 days** |
| Timeframe | 8h candles |
| Signal check | Every 15 minutes |

## ✨ Performance Summary

| Metric | Value |
|---|---|
| **Total trades** | **28** |
| **Win trades** | **17** |
| **Loss trades** | **11** |
| **Win rate** | **60.71%** |
| **Total deployed capital** | **$2,800** |
| **Net PNL ($)** | **+$18.26** |
| **Net PNL (%)** | **+18.26%** |
| **ROI on capital** | **+0.65%** |
| **Avg PNL per trade** | **+$0.65** (+0.65%) |
| **Best trade** | **+$5.37** (+5.37%) |
| **Worst trade** | **−$1.40** (−1.40%) |
| **Worst drawdown (%)** | **−1.40%** |
| **Worst drawdown ($)** | **−$1.40** |
| **Max consecutive wins** | **6** |
| **Max consecutive losses** | **4** |

### 📈 Risk Metrics

| Metric | Value |
|---|---|
| Sharpe Ratio | 0.312 |
| Hard stop distance | 1% |
| Trailing take distance | 1% from peak |
| Max loss per position | $1 (1% of $100) |
| Avg trade duration | ~8-24 hours |

## 📋 Best & Worst Trades

### Best Trade (+5.37%)
- **Date:** Oct 6, 2021 08:27 UTC
- **Open:** $50,901.21
- **Close:** $53,849.19
- **Profit:** +$5.37 (+5.37%)

### Worst Trade (−1.40%)
- **Date:** Oct 13, 2021 06:00 UTC
- **Open:** $55,172.85
- **Close:** $54,621.12
- **Loss:** −$1.40 (−1.40%)

## 🔬 Strategy Logic

### Signal Generation (every 15 minutes)

1. **Training Phase** (cached for 8h):
   - Fetch last 58 candles (50 for training + 8 for prediction window)
   - Train neural network on first 50 candles
   - Use last 8 candles as prediction input

2. **Prediction:**
   - Model outputs normalized close prediction [0, 1]
   - Convert to price: `price = low + prediction * (high - low)`

3. **Entry Signal:**
   ```typescript
   if (currentPrice < prediction.price) {
     Position.moonbag({
       position: "long",
       currentPrice,
       percentStopLoss: 1.0,  // 1% hard stop
     })
   }
   ```

4. **Exit Logic (trailing take):**
   - Monitors peak profit continuously
   - Closes position when profit retraces 1% from peak
   - Example: If position reaches +3% profit, closes at +2% (3% - 1% = 2%)

### Position Management

- **Entry size:** $100 per trade
- **Hard stop:** 1% below entry
- **Trailing take:** 1% below highest profit peak
- **Re-training:** Model re-trains every 8h with fresh data

## 📊 Trade Distribution

| Position Type | Count | Total PNL |
|---|---|---|
| LONG | 28 | +$18.26 |
| SHORT | 0 | $0.00 |

## 🚀 How to Run

```bash
npm start -- --backtest --symbol BTCUSDT \
  --strategy oct_2021_strategy \
  --exchange ccxt-exchange \
  --frame oct_2021_frame \
  ./content/oct_2021.strategy/oct_2021.strategy.ts
```

Add `--ui` to open the web dashboard at `http://localhost:60050`:

```bash
npm start -- --backtest --symbol BTCUSDT --ui \
  ./content/oct_2021.strategy/oct_2021.strategy.ts
```

## 🌍 Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
# Telegram notifications (optional)
CC_TELEGRAM_TOKEN=your_bot_token_here
CC_TELEGRAM_CHANNEL=-100123456789

# Web UI server (optional, defaults shown)
CC_WWWROOT_HOST=0.0.0.0
CC_WWWROOT_PORT=60050
```
