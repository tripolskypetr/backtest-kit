---
title: demo/optimization/readme
group: demo/optimization
---

# AI Strategy Optimizer

Automated trading strategy generation system using LLM-powered analysis and backtest-kit framework.

## Purpose

Demonstrates AI-driven strategy optimization capabilities for:
- Multi-timeframe market data analysis (1h, 30m, 15m, 1m candles)
- LLM-based pattern recognition and strategy generation
- Automated strategy comparison and validation
- Data-driven trading decision recommendations

## Key Features

- **Multi-Timeframe Analysis**: 4 data sources with different granularity levels
  - Long-term (1h candles): 48h lookback with Fibonacci levels
  - Swing-term (30m candles): 96 candles with volume/volatility analysis
  - Short-term (15m candles): Fast indicators and ROC metrics
  - Micro-term (1m candles): 60 candles with squeeze momentum and pressure index

- **LLM Integration**: Ollama-powered strategy generation (gpt-oss:20b)
- **Training/Testing Split**: 7-day training period → 1-day validation
- **Walker Framework**: Automatic strategy comparison and ranking
- **Progress Monitoring**: Real-time optimization tracking
- **Rich Indicators**: 50+ technical indicators across all timeframes
  - RSI, Stochastic RSI, MACD, ADX, ATR, CCI
  - Bollinger Bands, Moving Averages (SMA, EMA, DEMA, WMA)
  - Support/Resistance levels, Momentum, ROC
  - Volume analysis, Volatility metrics

## Technology Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: backtest-kit 1.4.3
- **AI Provider**: Ollama (gpt-oss:20b model)
- **Utilities**: functools-kit 1.0.93
- **Data Source**: node-ccxt-dumper API

## Project Structure

```
demo/optimization/
├── src/
│   └── index.mjs        # Main optimizer configuration
├── generated/           # AI-generated strategy code (output)
├── package.json         # Dependencies and scripts
└── README.md           # This file
```

## Installation and Setup

```bash
# Navigate to project directory
cd demo/optimization

# Install dependencies
npm install

# Set environment variables
export OLLAMA_API_KEY=your_ollama_api_key

# Run optimizer
npm start
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```env
OLLAMA_API_KEY=your_ollama_api_key
CCXT_DUMPER_URL=node-ccxt-dumper-instance
```

### Training Configuration

The optimizer is pre-configured for BTCUSDT with:

- **Training Period**: November 24-30, 2025 (7 days)
- **Testing Period**: December 1, 2025 (1 day)
- **Symbol**: BTCUSDT
- **Data Source**: [node-ccxt-dumper](https://github.com/tripolskypetr/node-ccxt-dumper)

### Data Sources

1. **long-term-range** - 1h candles with Fibonacci analysis
2. **swing-term-range** - 30m candles with volume/volatility
3. **short-term-range** - 15m candles with ROC metrics
4. **micro-term-range** - 1m candles with pressure index

## Usage Examples

### Basic Usage

Run the optimizer to generate strategies:

```bash
npm start
```

Output:
```
Progress: 14.285714285714286%
Progress: 28.571428571428573%
Progress: 42.857142857142854%
Progress: 57.14285714285714%
Progress: 71.42857142857143%
Progress: 85.71428571428571%
Progress: 100%
```

Generated file: `./generated/btc-optimizer_BTCUSDT.mjs`

### Running Generated Strategies

After generation, execute the strategy comparison:

```bash
node ./generated/btc-optimizer_BTCUSDT.mjs
```

This will:
1. Initialize 7 strategies (one per training day)
2. Run Walker comparison on test data
3. Rank strategies by performance (Sharpe Ratio)
4. Output best strategy statistics

### Customizing Symbols

Modify `src/index.mjs` to analyze different cryptocurrencies:

```javascript
await Optimizer.dump(
  "ETHUSDT",  // Change symbol
  {
    optimizerName: "btc-optimizer",
  },
  "./generated"
);
```

### Adjusting Time Ranges

Edit training/testing periods in `src/index.mjs`:

```javascript
const TRAIN_RANGE = [
  {
    note: "Custom period 1",
    startDate: new Date("2025-01-01T00:00:00Z"),
    endDate: new Date("2025-01-01T23:59:59Z"),
  },
  // Add more training periods...
];

const TEST_RANGE = {
  note: "Validation period",
  startDate: new Date("2025-01-08T00:00:00Z"),
  endDate: new Date("2025-01-08T23:59:59Z"),
};
```

## How It Works

### Phase 1: Data Collection

For each training period (7 days):
1. Fetches data from 4 sources (long/swing/short/micro-term)
2. Formats data with technical indicator descriptions
3. Builds conversation context for LLM

### Phase 2: Strategy Generation

For each training period:
1. LLM analyzes historical patterns
2. Generates trading strategy with entry/exit rules
3. Creates fundamental analysis with market recommendations
4. Stores strategy prompt and configuration

### Phase 3: Code Generation

1. Generates complete executable `.mjs` file
2. Includes:
   - Exchange configuration (Binance via CCXT)
   - Frame definitions (training + testing periods)
   - 7 strategy implementations
   - Walker setup for comparison
   - Event listeners for progress tracking

### Phase 4: Validation

Generated code runs Walker to:
1. Execute all strategies on test data
2. Calculate performance metrics (Sharpe Ratio, Win Rate, PNL)
3. Rank strategies by selected metric
4. Output best-performing strategy

## LLM Prompt Engineering

The system uses strategic prompting for better strategy generation:

```javascript
// System prompt
"В ответ напиши торговую стратегию где нет ничего лишнего,
только отчёт готовый для копипасты целиком

**ВАЖНО**: Не здоровайся, не говори что делаешь - только отчёт!"

// User prompt
`На каких условиях мне купить ${symbol}?
Дай анализ рынка на основе поддержки/сопротивления, точек входа в LONG/SHORT позиции.
Какой RR ставить для позиций?
Предпочтительны LONG или SHORT позиции?

Сделай не сухой технический, а фундаментальный анализ,
содержащий стратигическую рекомендацию, например, покупать на низу боковика`
```

This encourages:
- Concise, actionable strategies
- Support/resistance analysis
- Risk/reward ratios
- Long/short position preferences
- Fundamental (not just technical) analysis

## Performance Metrics

Generated strategies are evaluated by:

- **Sharpe Ratio**: Risk-adjusted returns
- **Win Rate**: Percentage of profitable trades
- **Average PNL**: Mean profit/loss per trade
- **Total PNL**: Cumulative profit/loss
- **Certainty Ratio**: avgWin / |avgLoss|
- **Max Drawdown**: Largest peak-to-trough decline
- **Expected Yearly Returns**: Annualized profit estimate

## Economic Benefits

- **Automated Strategy Development**: LLM generates strategies from raw data
- **Data-Driven Decisions**: 50+ indicators across 4 timeframes
- **Backtesting Validation**: Historical performance verification
- **Strategy Diversity**: 7 different approaches per optimization run
- **Time Savings**: Minutes vs. days of manual strategy development
- **Reproducibility**: Deterministic code generation from data

## Advanced Customization

### Adding New Data Sources

```javascript
SOURCE_LIST.push({
  name: "custom-indicators",
  fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
    // Fetch custom data
    return data.rows;
  },
  user: (symbol, data) => str.newline(
    "=== CUSTOM INDICATORS ===",
    JSON.stringify(data)
  ),
  assistant: () => "Custom data received"
});
```

### Changing LLM Model

```javascript
const response = await ollama.chat({
  model: "llama3:70b",  // Use different model
  messages: [...]
});
```

### Custom Optimizer Callbacks

```javascript
addOptimizer({
  optimizerName: "btc-optimizer",
  // ... existing config
  callbacks: {
    onSourceData: (symbol, sourceName, data) => {
      console.log(`✓ Fetched ${data.length} rows from ${sourceName}`);
    },
    onData: (symbol, strategies) => {
      console.log(`✓ Generated ${strategies.length} strategies`);
    },
    onCode: (symbol, code) => {
      console.log(`✓ Code generated: ${code.length} bytes`);
    }
  }
});
```

## Related Projects

- [backtest-kit](https://github.com/tripolskypetr/backtest-kit) - Trading framework
- [node-ccxt-dumper](https://github.com/tripolskypetr/node-ccxt-dumper) - Historical data API
- [functools-kit](https://www.npmjs.com/package/functools-kit) - Utility functions

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
