---
title: demo/live/readme
group: demo/live
---

# AI-Powered Live Trading Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/live)

LLM-driven trading strategy with real-time execution and automated signal generation using backtest-kit framework. Suitable for **both paper trading and real money trading**.

## Purpose

Demonstrates AI-powered live trading strategy capabilities for:
- Real-time multi-timeframe candle analysis (1h, 15m, 5m, 1m)
- LLM-based signal generation with structured output
- Continuous monitoring and position management
- Debug logging for LLM conversations and signals
- Partial profit/loss tracking with scaling out
- Scheduled order management

## Key Features

- **Multi-Timeframe Analysis**: 4-level market structure analysis
  - Medium-term (1h candles): 24h trend analysis
  - Short-term (15m candles): 24 candles for swing structure
  - Main-term (5m candles): 24 candles for entry timing
  - Micro-term (1m candles): 30 candles for precise entries

- **LLM Integration**: Ollama-powered signal generation (deepseek-v3.1:671b)
- **Structured Output**: JSON schema validation for trading signals
- **Debug Logging**: Automatic conversation and signal dumping via `dumpSignal()`
- **Live Monitoring**: Real-time tick monitoring with background execution
- **Partial Profit/Loss**: Scale out positions at predefined profit/loss levels
- **Scheduled Orders**: Support for limit orders with automatic activation
- **Event Listeners**: Real-time notifications for signals, partial levels, and errors

## Trading Modes

This demo supports **two trading modes**:

### 1. Paper Trading (Test Mode)
- **Zero Risk**: Simulates real trading without real money
- **Same Logic**: Identical code and signals as real trading
- **Perfect for**: Testing strategies, debugging, learning
- **Setup**: Uses exchange paper trading API or mock data

### 2. Real Money Trading (Production Mode)
- **Real Execution**: Executes actual trades on exchange
- **Real Risk**: Uses real funds and incurs real losses/profits
- **Perfect for**: Production deployment after thorough backtesting
- **Setup**: Requires real exchange API keys with trading permissions

**Important**: Always start with paper trading to validate strategy performance before risking real capital.

## Technology Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: backtest-kit 1.4.3
- **AI Provider**: Ollama (deepseek-v3.1:671b model)
- **Exchange**: Binance via CCXT
- **UUID**: uuid for unique result tracking

## Project Structure

```
demo/live/
├── src/
│   ├── index.mjs              # Main live trading configuration
│   └── utils/
│       ├── json.mjs           # LLM API client (Ollama)
│       └── messages.mjs       # Multi-timeframe message builder
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## Installation and Setup

```bash
# Navigate to project directory
cd demo/live

# Install dependencies
npm install

# Set environment variables
export OLLAMA_API_KEY=your_ollama_api_key

# Run live trading
npm start
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```env
OLLAMA_API_KEY=your_ollama_api_key
```

### Live Trading Configuration

The demo is pre-configured for BTCUSDT with:

- **Trading Period**: December 1, 2025 (full day) - define frame for replay/testing
- **Symbol**: BTCUSDT
- **Strategy Interval**: 5m (signal generation frequency)
- **Frame Interval**: 1m (tick resolution)
- **Exchange**: Binance (via CCXT)
- **Execution Mode**: Background (non-blocking continuous monitoring)

### Signal Generation Rules

LLM follows strict rules for signal generation:

1. **Position Types**:
   - `position='wait'`: No clear signal, wait for better conditions
   - `position='long'`: Bullish signal, price expected to rise
   - `position='short'`: Bearish signal, price expected to fall

2. **Entry Price** (`priceOpen`):
   - Can be current market price for immediate entry
   - Can be limit order price for delayed entry (scheduled signal)
   - Must have technical justification

3. **Exit Levels**:
   - LONG: `priceTakeProfit > priceOpen > priceStopLoss`
   - SHORT: `priceStopLoss > priceOpen > priceTakeProfit`
   - Levels based on S/R, Fibonacci, Bollinger Bands

4. **Time Estimate** (`minuteEstimatedTime`):
   - Expected time to reach TP (max 360 minutes)
   - Calculated from ATR, ADX, MACD, Momentum

### Partial Profit/Loss Configuration

The demo implements scaling out at predefined levels:

**Profit Levels** (defined in `Constant`):
- `TP_LEVEL3` (25% profit): Close 33% of position
- `TP_LEVEL2` (50% profit): Close 33% of position
- `TP_LEVEL1` (100% profit): Close remaining 34%

**Loss Levels**:
- `SL_LEVEL2` (-50% loss): Close 50% of position
- `SL_LEVEL1` (-100% loss): Close remaining 50%

## Usage Examples

### Basic Usage

Run live trading:

```bash
npm start
```

Output:
```
{ action: 'idle', signal: null, strategyName: 'test_strategy', ... }
{ action: 'opened', signal: { id: '...', position: 'long', ... }, ... }
BTCUSDT reached 25% profit at 51250
Close 33% at 25% profit
BTCUSDT reached 50% profit at 51500
Close 33% at 50% profit
{ action: 'closed', signal: { ... }, pnl: { pnlPercentage: 2.0 }, ... }
Backtest report saved: ./dump/backtest/test_strategy.md
Partial profit/loss report saved: ./dump/partial/BTCUSDT_test_strategy.md
```

Generated files:
- `./dump/backtest/test_strategy.md` - Live trading performance report
- `./dump/partial/BTCUSDT_test_strategy.md` - Partial profit/loss events
- `./dump/schedule/test_strategy.md` - Scheduled orders report
- `./dump/strategy/{uuid}/` - LLM conversation logs (one per signal)

### Analyzing Live Performance

After trading session, check performance report:

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

### Analyzing Partial Events

Check partial profit/loss tracking:

```bash
cat ./dump/partial/BTCUSDT_test_strategy.md
```

Example output:
```markdown
# Partial Profit/Loss Report: BTCUSDT:test_strategy

| Action | Symbol | Strategy | Signal ID | Position | Level % | Current Price | Timestamp | Mode |
|--------|--------|----------|-----------|----------|---------|---------------|-----------|------|
| PROFIT | BTCUSDT | test_strategy | abc123 | LONG | +25% | 51250.00000000 USD | 2025-12-01T10:30:00.000Z | Live |
| PROFIT | BTCUSDT | test_strategy | abc123 | LONG | +50% | 51500.00000000 USD | 2025-12-01T11:00:00.000Z | Live |

**Total events:** 2
**Profit events:** 2
**Loss events:** 0
```

### Analyzing Scheduled Orders

Check scheduled order tracking:

```bash
cat ./dump/schedule/test_strategy.md
```

This shows all limit orders that were scheduled and their activation/cancellation status.

### Event Listeners in Action

The demo includes three key event listeners:

#### 1. Signal Events (`listenSignalLive`)

Monitors all signal lifecycle events:

```javascript
listenSignalLive(async (event) => {
  if (event.action === "closed") {
    // Generate reports when position closes
    await Live.dump(event.strategyName);
    await Partial.dump(event.symbol, event.strategyName);
  }
  if (event.action === "scheduled") {
    // Track scheduled limit orders
    await Schedule.dump(event.strategyName);
  }
  if (event.action === "cancelled") {
    // Track cancelled limit orders
    await Schedule.dump(event.strategyName);
  }
  console.log(event); // Log all events
});
```

**Events emitted**:
- `action: 'idle'` - No active position
- `action: 'opened'` - Position opened at market/limit price
- `action: 'active'` - Position being monitored
- `action: 'scheduled'` - Limit order created, waiting for activation
- `action: 'cancelled'` - Scheduled order cancelled without execution
- `action: 'closed'` - Position closed (TP/SL/timeout)

#### 2. Partial Profit Events (`listenPartialProfit`)

Tracks profit milestones for scaling out:

```javascript
listenPartialProfit(({ symbol, price, level }) => {
  console.log(`${symbol} reached ${level}% profit at ${price}`);

  if (level === Constant.TP_LEVEL3) {
    console.log("Close 33% at 25% profit");
    // Execute partial close via exchange API
  }
  if (level === Constant.TP_LEVEL2) {
    console.log("Close 33% at 50% profit");
    // Execute partial close via exchange API
  }
  if (level === Constant.TP_LEVEL1) {
    console.log("Close 34% at 100% profit");
    // Execute final close via exchange API
  }
});
```

**Use cases**:
- Scale out winning positions gradually
- Lock in profits at predefined levels
- Reduce risk while maintaining upside potential

#### 3. Partial Loss Events (`listenPartialLoss`)

Tracks loss milestones for risk management:

```javascript
listenPartialLoss(({ symbol, price, level }) => {
  console.log(`${symbol} reached -${level}% loss at ${price}`);

  if (level === Constant.SL_LEVEL2) {
    console.log("Close 50% at -50% loss");
    // Execute partial stop loss via exchange API
  }
  if (level === Constant.SL_LEVEL1) {
    console.log("Close 50% at -100% loss");
    // Execute final stop loss via exchange API
  }
});
```

**Use cases**:
- Scale out losing positions to limit damage
- Preserve capital for future opportunities
- Reduce drawdown during adverse price movement

#### 4. Error Events (`listenError`)

Catches all errors for debugging and monitoring:

```javascript
listenError((error) => {
  console.error("Error occurred:", error);
  // Send notification, log to monitoring system, etc.
});
```

**Error types**:
- Exchange API errors (rate limits, timeouts)
- Signal validation errors (invalid TP/SL logic)
- LLM generation failures
- Network connectivity issues

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

Modify `src/index.mjs` to trade different cryptocurrencies:

```javascript
Live.background("ETHUSDT", {  // Change symbol
  strategyName: "test_strategy",
  exchangeName: "test_exchange",
  frameName: "test_frame",
});
```

### Adjusting Time Periods

Edit trading period in `src/index.mjs` (for replay/testing mode):

```javascript
addFrame({
  frameName: "test_frame",
  interval: "1m",
  startDate: new Date("2025-12-15T00:00:00.000Z"),
  endDate: new Date("2025-12-15T23:59:59.000Z"),
});
```

**Note**: For true live trading, remove date constraints and let it run continuously.

## How It Works

### Phase 1: Continuous Monitoring

`Live.background()` runs in a loop:
1. Fetches latest price every 1m (frame interval)
2. Checks if strategy interval (5m) has elapsed
3. If elapsed, triggers signal generation
4. Otherwise, monitors existing position for TP/SL/timeout

### Phase 2: Multi-Timeframe Data Collection

For each signal generation (every 5 minutes):
1. Fetches 1h candles (24 candles, ~24h lookback)
2. Fetches 15m candles (24 candles, ~6h lookback)
3. Fetches 5m candles (24 candles, ~2h lookback)
4. Fetches 1m candles (30 candles, ~30min lookback)
5. Formats data into human-readable OHLCV strings

### Phase 3: LLM Conversation Building

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

### Phase 4: Signal Generation and Validation

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

Framework validates:
- Position type is valid (wait/long/short)
- TP/SL logic is correct (LONG: TP > Open > SL)
- Prices are reasonable (not negative, not too far from current)
- Time estimate is within bounds (0-360 minutes)

### Phase 5: Debug Logging

`dumpSignal()` saves:
- Complete conversation history (messages array)
- Final LLM output (signal JSON)
- Unique UUID for tracking each signal
- Files in `./dump/strategy/{uuid}/` directory

### Phase 6: Order Execution

Two execution paths:

**Path A: Immediate Execution** (if `priceOpen` equals current price):
1. Opens position at current market price
2. Sets TP/SL monitoring
3. Emits `action: 'opened'` event
4. Continues monitoring until TP/SL/timeout

**Path B: Scheduled Execution** (if `priceOpen` is limit price):
1. Creates scheduled order waiting for activation
2. Emits `action: 'scheduled'` event
3. Monitors price until it reaches `priceOpen`
4. If activated: opens position, emits `action: 'opened'`
5. If timeout/SL hit before activation: cancels order, emits `action: 'cancelled'`

### Phase 7: Partial Profit/Loss Monitoring

While position is active:
1. Monitors current price vs. entry price
2. Calculates unrealized PNL percentage
3. Checks against predefined profit/loss levels
4. Emits partial events when levels are crossed
5. Allows custom logic (scaling out, trailing stops, etc.)

### Phase 8: Position Closure

Position closes when:
- **Take Profit Hit**: Price reaches `priceTakeProfit`
- **Stop Loss Hit**: Price reaches `priceStopLoss`
- **Time Expired**: `minuteEstimatedTime` elapsed without TP/SL

Closure process:
1. Calculates final PNL (with fees and slippage)
2. Emits `action: 'closed'` event
3. Generates performance reports
4. Saves partial profit/loss events
5. Logs to console and files

### Phase 9: Report Generation

After each closure:
1. Updates live trading report (`./dump/backtest/{strategyName}.md`)
2. Updates partial events report (`./dump/partial/{symbol}_{strategyName}.md`)
3. Updates scheduled orders report (`./dump/schedule/{strategyName}.md`)
4. Aggregates performance metrics
5. Calculates Sharpe ratio, win rate, etc.

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

Live trading evaluates strategy by:

- **Total Signals**: Number of closed positions
- **Win Rate**: Percentage of profitable trades (higher is better)
- **Average PNL**: Mean profit/loss per trade (higher is better)
- **Total PNL**: Cumulative profit/loss (higher is better)
- **Sharpe Ratio**: Risk-adjusted returns (higher is better)
- **Annualized Sharpe Ratio**: Sharpe × √365 (higher is better)
- **Certainty Ratio**: avgWin / |avgLoss| (higher is better)
- **Expected Yearly Returns**: Annualized profit estimate (higher is better)
- **Standard Deviation**: Volatility metric (lower is better)

**Partial Event Metrics**:
- **Total Events**: Total profit/loss level crossings
- **Profit Events**: Number of profit milestone hits
- **Loss Events**: Number of loss milestone hits

## Economic Benefits

- **24/7 Monitoring**: Never miss trading opportunities
- **Automated Decision Making**: LLM analyzes 4 timeframes simultaneously
- **Reproducible Signals**: Same input → same output (deterministic)
- **Audit Trail**: Complete conversation logs for every signal
- **Risk Management**: Strict TP/SL validation and partial scaling
- **Time Efficiency**: Seconds vs. hours of manual chart analysis
- **Emotional Discipline**: No FOMO, no panic selling
- **Backtesting Compatibility**: Same code for backtest and live trading

## Paper Trading vs Real Money

### Paper Trading Setup

```javascript
// Use exchange testnet/paper trading API
const exchange = new ccxt.binance({
  apiKey: 'TESTNET_API_KEY',
  secret: 'TESTNET_SECRET',
  enableRateLimit: true,
  options: {
    defaultType: 'future',
    test: true,  // Enable testnet
  }
});
```

**Advantages**:
- Zero risk
- Unlimited testing
- Same API as production
- Perfect for strategy validation

**Limitations**:
- No real slippage
- No real liquidity constraints
- No psychological pressure

### Real Money Setup

```javascript
// Use exchange production API
const exchange = new ccxt.binance({
  apiKey: 'PRODUCTION_API_KEY',
  secret: 'PRODUCTION_SECRET',
  enableRateLimit: true,
  options: {
    defaultType: 'future',
  }
});
```

**Advantages**:
- Real market conditions
- Real slippage and fees
- Real psychological experience

**Critical Requirements**:
1. ✅ Thoroughly backtested strategy
2. ✅ Validated on paper trading
3. ✅ Risk management in place (position sizing, stop losses)
4. ✅ Monitoring and alerting configured
5. ✅ Emergency stop mechanism implemented
6. ✅ Sufficient capital to handle drawdowns

**Never trade with real money until**:
- Win rate > 60% in backtest
- Sharpe ratio > 1.0
- At least 100+ backtest signals
- At least 30 days paper trading
- Maximum drawdown < 20%

## Advanced Customization

### Adding Custom Partial Levels

```javascript
// Define custom profit levels
const CUSTOM_TP_LEVELS = {
  LEVEL_1: 10,  // 10% profit
  LEVEL_2: 30,  // 30% profit
  LEVEL_3: 75,  // 75% profit
};

listenPartialProfit(({ symbol, price, level }) => {
  if (level === CUSTOM_TP_LEVELS.LEVEL_1) {
    // Close 25% of position
    await exchange.createOrder(symbol, 'market', 'sell', quantity * 0.25);
  }
  // ... more levels
});
```

### Implementing Trailing Stop Loss

```javascript
let trailingStopLoss = null;

listenPartialProfit(({ symbol, price, level, signal }) => {
  // Activate trailing stop after 25% profit
  if (level >= 25 && !trailingStopLoss) {
    trailingStopLoss = price * 0.95; // 5% trailing
    console.log(`Trailing SL activated at ${trailingStopLoss}`);
  }

  // Update trailing stop if price moves up
  if (trailingStopLoss && price > trailingStopLoss / 0.95) {
    trailingStopLoss = price * 0.95;
    console.log(`Trailing SL updated to ${trailingStopLoss}`);
  }
});
```

### Adding Telegram Notifications

```javascript
import TelegramBot from 'node-telegram-bot-api';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const chatId = YOUR_CHAT_ID;

listenSignalLive(async (event) => {
  if (event.action === 'opened') {
    await bot.sendMessage(
      chatId,
      `📈 OPENED ${event.signal.position.toUpperCase()}\n` +
      `Symbol: ${event.symbol}\n` +
      `Price: ${event.signal.priceOpen}\n` +
      `TP: ${event.signal.priceTakeProfit}\n` +
      `SL: ${event.signal.priceStopLoss}`
    );
  }

  if (event.action === 'closed') {
    await bot.sendMessage(
      chatId,
      `💰 CLOSED\n` +
      `PNL: ${event.pnl.pnlPercentage.toFixed(2)}%\n` +
      `Reason: ${event.closeReason}`
    );
  }
});
```

### Multi-Symbol Trading

```javascript
const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

for (const symbol of symbols) {
  Live.background(symbol, {
    strategyName: "test_strategy",
    exchangeName: "test_exchange",
    frameName: "test_frame",
  });
}

// Track positions per symbol
const positions = new Map();

listenSignalLive((event) => {
  if (event.action === 'opened') {
    positions.set(event.symbol, event.signal);
  }
  if (event.action === 'closed') {
    positions.delete(event.symbol);
  }

  console.log(`Active positions: ${positions.size}`);
});
```

### Position Sizing Based on Risk

```javascript
// Calculate position size based on account balance and risk
const calculatePositionSize = (accountBalance, riskPercentage, stopLossPercentage) => {
  const riskAmount = accountBalance * (riskPercentage / 100);
  const positionSize = riskAmount / (stopLossPercentage / 100);
  return positionSize;
};

listenSignalLive(async (event) => {
  if (event.action === 'opened') {
    const balance = await exchange.fetchBalance();
    const stopLossPercentage = Math.abs(
      (event.signal.priceStopLoss - event.signal.priceOpen) / event.signal.priceOpen * 100
    );

    const quantity = calculatePositionSize(
      balance.total.USDT,
      2, // Risk 2% of account per trade
      stopLossPercentage
    );

    console.log(`Position size: ${quantity} USDT`);
    // Execute order with calculated quantity
  }
});
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

**Issue**: `Position not closing at TP/SL`
```javascript
// Solution: Check exchange order execution
// Verify price monitoring is working correctly
// Inspect logs for price discrepancies
```

**Issue**: `Partial events not firing`
```javascript
// Solution: Verify Partial service is initialized
// Check if partial levels are configured correctly
// Ensure listenPartialProfit/Loss are registered before Live.background()
```

## Safety Guidelines

### Risk Management Checklist

- [ ] **Position Sizing**: Never risk more than 1-2% per trade
- [ ] **Stop Loss**: Always set stop loss on every trade
- [ ] **Maximum Drawdown**: Stop trading if drawdown > 20%
- [ ] **Daily Loss Limit**: Stop if daily loss > 5% of account
- [ ] **Maximum Open Positions**: Limit to 2-3 concurrent trades
- [ ] **Emergency Stop**: Implement kill switch to close all positions
- [ ] **Monitoring**: Set up alerts for errors and unusual PNL

### Emergency Stop Mechanism

```javascript
// Add to src/index.mjs
let emergencyStop = false;

process.on('SIGINT', async () => {
  console.log('Emergency stop triggered!');
  emergencyStop = true;

  // Close all open positions
  const positions = await exchange.fetchOpenOrders();
  for (const position of positions) {
    await exchange.cancelOrder(position.id);
  }

  process.exit(0);
});

// Check before each trade
listenSignalLive((event) => {
  if (emergencyStop) {
    console.log('Emergency stop active, skipping signal');
    return;
  }
  // ... normal processing
});
```

## Related Projects

- [backtest-kit](https://github.com/tripolskypetr/backtest-kit) - Trading framework
- [node-ccxt-dumper](https://github.com/tripolskypetr/node-ccxt-dumper) - Historical data API
- [ollama](https://ollama.com) - Local LLM inference
- [ccxt](https://github.com/ccxt/ccxt) - Cryptocurrency exchange API

## Next Steps

1. **Paper Trading**: Start with testnet/paper trading for at least 30 days
2. **Strategy Optimization**: Use backtest demo to optimize prompts
3. **Risk Management**: Implement position sizing and daily loss limits
4. **Monitoring**: Set up Telegram/Discord notifications
5. **Real Trading**: Only after thorough validation with paper trading
6. **Portfolio Management**: Extend to multiple symbols with correlation analysis

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
