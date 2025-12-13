---
title: demo/backtest/readme
group: demo/backtest
---

# AI-Powered Backtest Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/backtest)

LLM-driven trading strategy with multi-timeframe analysis and automated backtesting using backtest-kit framework.

## Purpose

Demonstrates AI-powered trading strategy capabilities for:
- Real-time multi-timeframe candle analysis (1h, 15m, 5m, 1m)
- LLM-based signal generation with structured output
- Automated backtesting with performance metrics
- Debug logging for LLM conversations and signals

## Key Features

- **Multi-Timeframe Analysis**: 4-level market structure analysis
  - Medium-term (1h candles): 24h trend analysis
  - Short-term (15m candles): 24 candles for swing structure
  - Main-term (5m candles): 24 candles for entry timing
  - Micro-term (1m candles): 30 candles for precise entries

- **LLM Integration**: Ollama-powered signal generation (deepseek-v3.1:671b)
- **Structured Output**: JSON schema validation for trading signals
- **Debug Logging**: Automatic conversation and signal dumping via `dumpSignal()`
- **Progress Tracking**: Real-time backtest progress monitoring
- **Performance Reports**: Automated markdown report generation

## Technology Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: backtest-kit 1.4.3
- **AI Provider**: Ollama (deepseek-v3.1:671b model)
- **Exchange**: Binance via CCXT
- **UUID**: uuid for unique result tracking

## Project Structure

```
demo/backtest/
├── src/
│   ├── index.mjs              # Main backtest configuration
│   └── utils/
│       ├── json.mjs           # LLM API client (Ollama)
│       └── messages.mjs       # Multi-timeframe message builder
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## Installation and Setup

```bash
# Navigate to project directory
cd demo/backtest

# Install dependencies
npm install

# Set environment variables
export OLLAMA_API_KEY=your_ollama_api_key

# Run backtest
npm start
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```env
OLLAMA_API_KEY=your_ollama_api_key
```

### Backtest Configuration

The demo is pre-configured for BTCUSDT with:

- **Backtest Period**: December 1, 2025 (full day)
- **Symbol**: BTCUSDT
- **Strategy Interval**: 5m (signal generation frequency)
- **Frame Interval**: 1m (tick resolution)
- **Exchange**: Binance (via CCXT)

### Signal Generation Rules

LLM follows strict rules for signal generation:

1. **Position Types**:
   - `position='wait'`: No clear signal, wait for better conditions
   - `position='long'`: Bullish signal, price expected to rise
   - `position='short'`: Bearish signal, price expected to fall

2. **Entry Price** (`priceOpen`):
   - Can be current market price for immediate entry
   - Can be limit order price for delayed entry
   - Must have technical justification

3. **Exit Levels**:
   - LONG: `priceTakeProfit > priceOpen > priceStopLoss`
   - SHORT: `priceStopLoss > priceOpen > priceTakeProfit`
   - Levels based on S/R, Fibonacci, Bollinger Bands

4. **Time Estimate** (`minuteEstimatedTime`):
   - Expected time to reach TP (max 360 minutes)
   - Calculated from ATR, ADX, MACD, Momentum

## Usage Examples

### Basic Usage

Run the backtest:

```bash
npm start
```

Output:
```
Progress: 25.00%
Processed: 360 / 1440
Progress: 50.00%
Processed: 720 / 1440
Progress: 75.00%
Processed: 1080 / 1440
Progress: 100.00%
Processed: 1440 / 1440
Backtest completed: BTCUSDT
```

Generated files:
- `./dump/backtest/test_strategy.md` - Performance report
- `./dump/strategy/{uuid}/` - LLM conversation logs (one per signal)

### Analyzing Results

After backtest completes, check performance report:

```bash
cat ./dump/backtest/test_strategy.md
```

Example output:
```markdown
# Backtest Report: test_strategy

| Signal ID | Symbol   | Position | Open Price | Close Price | PNL (net) | Close Reason |
|-----------|----------|----------|------------|-------------|-----------|--------------|
| signal-1  | BTCUSDT  | LONG     | 50000 USD  | 51000 USD   | +2.00%    | take_profit  |
| signal-2  | BTCUSDT  | SHORT    | 51500 USD  | 50500 USD   | +1.94%    | take_profit  |

**Total signals:** 15
**Win rate:** 73.33% (11W / 4L)
**Average PNL:** +0.85%
**Sharpe Ratio:** 1.234
```

### Debugging LLM Conversations

Each signal generates debug logs in `./dump/strategy/{uuid}/`:

```
./dump/strategy/a1b2c3d4-e5f6-7890-abcd-ef1234567890/
├── 00_system_prompt.md       # System instructions
├── 01_user_message.md         # 1h candles analysis
├── 02_assistant_message.md    # LLM acknowledgment
├── 03_user_message.md         # 15m candles analysis
├── 04_assistant_message.md    # LLM acknowledgment
├── 05_user_message.md         # 5m candles analysis
├── 06_assistant_message.md    # LLM acknowledgment
├── 07_user_message.md         # 1m candles analysis
├── 08_assistant_message.md    # LLM acknowledgment
├── 09_user_message.md         # Signal generation request
└── 10_llm_output.md           # Final signal with JSON
```

### Customizing Symbols

Modify `src/index.mjs` to analyze different cryptocurrencies:

```javascript
Backtest.background("ETHUSDT", {  // Change symbol
  strategyName: "test_strategy",
  exchangeName: "test_exchange",
  frameName: "test_frame",
});
```

### Adjusting Time Periods

Edit backtest period in `src/index.mjs`:

```javascript
addFrame({
  frameName: "test_frame",
  interval: "1m",
  startDate: new Date("2025-12-15T00:00:00.000Z"),
  endDate: new Date("2025-12-15T23:59:59.000Z"),
});
```

## How It Works

### Phase 1: Multi-Timeframe Data Collection

For each signal generation (every 5 minutes):
1. Fetches 1h candles (24 candles, ~24h lookback)
2. Fetches 15m candles (24 candles, ~6h lookback)
3. Fetches 5m candles (24 candles, ~2h lookback)
4. Fetches 1m candles (30 candles, ~30min lookback)
5. Formats data into human-readable OHLCV strings

### Phase 2: LLM Conversation Building

Creates structured conversation:
1. **User**: Provides 1h candles with symbol name
2. **Assistant**: Acknowledges trend analysis
3. **User**: Provides 15m candles
4. **Assistant**: Acknowledges swing structure analysis
5. **User**: Provides 5m candles
6. **Assistant**: Acknowledges main timeframe analysis
7. **User**: Provides 1m candles
8. **Assistant**: Acknowledges microstructure analysis
9. **User**: Requests final trading signal
10. **LLM**: Returns structured JSON signal

### Phase 3: Signal Generation

LLM analyzes all timeframes and returns:
```json
{
  "position": "long",
  "note": "Strong bullish momentum on 1h, breakout on 5m...",
  "priceOpen": 50000,
  "priceTakeProfit": 51000,
  "priceStopLoss": 49000,
  "minuteEstimatedTime": 120
}
```

### Phase 4: Debug Logging

`dumpSignal()` saves:
- Complete conversation history (messages array)
- Final LLM output (signal JSON)
- Unique UUID for tracking each signal
- Files in `./dump/strategy/{uuid}/` directory

### Phase 5: Backtesting Execution

Framework validates and executes signal:
1. Validates signal structure (TP/SL logic, prices, timestamps)
2. Simulates order execution at `priceOpen`
3. Tracks price movement until TP/SL hit or timeout
4. Records PNL and close reason
5. Emits events for progress tracking

### Phase 6: Report Generation

After backtest completes:
1. Aggregates all closed signals
2. Calculates performance metrics
3. Generates markdown report
4. Saves to `./dump/backtest/{strategyName}.md`

## LLM Prompt Engineering

### System Prompt Strategy

```javascript
{
  role: "system",
  content: `
    Проанализируй торговую стратегию и верни торговый сигнал.

    ПРАВИЛА ОТКРЫТИЯ ПОЗИЦИЙ:
    1. ТИПЫ ПОЗИЦИЙ:
       - position='wait': нет четкого сигнала
       - position='long': бычий сигнал
       - position='short': медвежий сигнал

    2. ЦЕНА ВХОДА (priceOpen):
       - Текущая рыночная или отложенная цена
       - Обоснование по техническому анализу

    3. УРОВНИ ВЫХОДА:
       - LONG: priceTakeProfit > priceOpen > priceStopLoss
       - SHORT: priceStopLoss > priceOpen > priceTakeProfit
       - На основе Fibonacci, S/R, Bollinger

    4. ВРЕМЕННЫЕ РАМКИ:
       - minuteEstimatedTime: макс 360 минут
       - Расчет по ATR, ADX, MACD, Momentum
  `
}
```

This encourages:
- Conservative signal generation (wait when uncertain)
- Technically justified entry/exit levels
- Realistic time estimates
- Risk-aware position sizing

### User Prompt Strategy

Final request emphasizes caution:
```
Проанализируй все таймфреймы и сгенерируй торговый сигнал.
Открывай позицию ТОЛЬКО при четком сигнале.

Если сигналы противоречивы или тренд слабый то position: wait
```

This prevents:
- Overtrading in unclear market conditions
- Entry without multi-timeframe confirmation
- Ignoring conflicting signals

## Performance Metrics

Backtest evaluates strategy by:

- **Total Signals**: Number of closed positions
- **Win Rate**: Percentage of profitable trades (higher is better)
- **Average PNL**: Mean profit/loss per trade (higher is better)
- **Total PNL**: Cumulative profit/loss (higher is better)
- **Sharpe Ratio**: Risk-adjusted returns (higher is better)
- **Annualized Sharpe Ratio**: Sharpe × √365 (higher is better)
- **Certainty Ratio**: avgWin / |avgLoss| (higher is better)
- **Expected Yearly Returns**: Annualized profit estimate (higher is better)
- **Standard Deviation**: Volatility metric (lower is better)

## Economic Benefits

- **Automated Decision Making**: LLM analyzes 4 timeframes simultaneously
- **Reproducible Signals**: Same input → same output (deterministic)
- **Audit Trail**: Complete conversation logs for every signal
- **Performance Validation**: Historical backtesting before live trading
- **Risk Management**: Strict TP/SL validation and position sizing
- **Time Efficiency**: Seconds vs. hours of manual chart analysis

## Advanced Customization

### Adding New Timeframes

```javascript
// In utils/messages.mjs
const longTermCandles = await getCandles(symbol, "4h", 24);

messages.push(
  {
    role: "user",
    content: `Проанализируй свечи 4h:\n${formatCandles(longTermCandles, "4h")}`
  },
  {
    role: "assistant",
    content: "Долгосрочный тренд 4h проанализирован"
  }
);
```

### Changing LLM Model

```javascript
// In utils/json.mjs
const response = await ollama.chat({
  model: "llama3.3:70b",  // Use different model
  messages: [...]
});
```

### Custom Signal Schema

```javascript
// In utils/json.mjs - modify format property
format: {
  type: "object",
  properties: {
    position: { type: "string", enum: ["wait", "long", "short"] },
    note: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },  // Add confidence
    // ... existing fields
  }
}
```

### Custom Event Handlers

```javascript
// In src/index.mjs
listenSignalBacktest((event) => {
  if (event.action === "opened") {
    console.log(`📈 Opened ${event.signal.position} at ${event.signal.priceOpen}`);
  } else if (event.action === "closed") {
    console.log(`💰 Closed with PNL: ${event.pnl.pnlPercentage.toFixed(2)}%`);
  }
});
```

### Parallel Backtesting

```javascript
// Test multiple symbols simultaneously
const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

for (const symbol of symbols) {
  Backtest.background(symbol, {
    strategyName: "test_strategy",
    exchangeName: "test_exchange",
    frameName: "test_frame",
  });
}
```

## Troubleshooting

### Common Issues

**Issue**: `OLLAMA_API_KEY is not defined`
```bash
# Solution: Set environment variable
export OLLAMA_API_KEY=your_key
```

**Issue**: `Rate limit exceeded`
```javascript
// Solution: Add delay between requests in utils/json.mjs
await new Promise(resolve => setTimeout(resolve, 1000));
```

**Issue**: `Invalid signal structure`
```javascript
// Solution: Check LLM output format matches schema
// Verify all required fields are present in JSON response
```

**Issue**: `No signals generated (all 'wait')`
```javascript
// Solution: Adjust prompt to be more aggressive
// Or check if market data has sufficient volatility
```

## Related Projects

- [backtest-kit](https://github.com/tripolskypetr/backtest-kit) - Trading framework
- [node-ccxt-dumper](https://github.com/tripolskypetr/node-ccxt-dumper) - Historical data API
- [ollama](https://ollama.com) - Local LLM inference
- [ccxt](https://github.com/ccxt/ccxt) - Cryptocurrency exchange API

## Next Steps

1. **Optimize Strategy**: Analyze debug logs to improve prompts
2. **Add Indicators**: Calculate RSI, MACD, Bollinger Bands before LLM
3. **Live Trading**: Use `Live.background()` for real-time execution
4. **Strategy Comparison**: Run Walker to compare different prompts
5. **Portfolio Trading**: Extend to multiple symbols with risk limits

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
