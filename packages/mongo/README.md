<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/consciousness.svg" height="45px" align="right">

# 🧿 @backtest-kit/mongo

> MongoDB + Redis persistence adapter for backtest-kit. Swaps the default file-based storage for a production-grade backend — one `setup()` call, no changes to strategy code.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/mongo.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/mongo)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

📚 **[Backtest Kit Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** | 🌟 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

> **New to backtest-kit?** The fastest way to get a real, production-ready setup is to clone the [reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example) — a fully working news-sentiment AI trading system with LLM forecasting, multi-timeframe data, and a documented February 2026 backtest. Start there instead of from scratch.

## 🚀 Installation

```bash
npm install @backtest-kit/mongo backtest-kit
```

## 📖 Usage

### Quick Start

```typescript
import { setup } from '@backtest-kit/mongo';

// Reads connection settings from environment variables.
// Call once before any trading operations.
setup();
```

### Explicit connection parameters

```typescript
import { setup } from '@backtest-kit/mongo';

setup({
  CC_MONGO_CONNECTION_STRING: 'mongodb://mongo:27017/mydb',
  CC_REDIS_HOST: 'redis',
  CC_REDIS_PORT: 6379,
  CC_REDIS_PASSWORD: 'secret',
});
```

## 📋 API Reference

| Export | Description |
|--------|-------------|
| **`setup(config?)`** | Configure and register all 15 adapters in one call. Reads from env vars when `config` is omitted. |
| **`install()`** | Register adapters only — use when configuration was already applied via `setConfig` or env vars. |
| **`setConfig(config)`** | Override individual connection parameters at runtime. |
| **`getConfig()`** | Returns the current merged configuration (env vars + any `setConfig` overrides). |
| **`setLogger(logger)`** | Replace the internal logger with your own implementation. |
| **`getMongo()`** | Returns the connected Mongoose instance (lazy singleton). |
| **`getRedis()`** | Returns the connected ioredis instance (lazy singleton). |

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_MONGO_CONNECTION_STRING` | `mongodb://localhost:27017/backtest-kit?wtimeoutMS=15000` | MongoDB connection string |
| `CC_REDIS_HOST` | `127.0.0.1` | Redis host |
| `CC_REDIS_PORT` | `6379` | Redis port |
| `CC_REDIS_USER` | _(empty)_ | Redis username |
| `CC_REDIS_PASSWORD` | _(empty)_ | Redis password |

Values passed to `setup()` or `setConfig()` always take precedence over environment variables.

## 🗂️ Adapters

Each adapter covers one persistence slot in backtest-kit. The table shows what it stores and which fields form its unique index in MongoDB:

| Adapter | MongoDB collection | Unique index |
|---------|--------------------|--------------|
| **Candle** | `candle-items` | `symbol + interval + timestamp` |
| **Signal** | `signal-items` | `symbol + strategyName + exchangeName` |
| **Schedule** | `schedule-items` | `symbol + strategyName + exchangeName` |
| **Risk** | `risk-items` | `riskName + exchangeName` |
| **Partial** | `partial-items` | `symbol + strategyName + exchangeName + signalId` |
| **Breakeven** | `breakeven-items` | `symbol + strategyName + exchangeName + signalId` |
| **Storage** | `storage-items` | `backtest + signalId` |
| **Notification** | `notification-items` | `backtest + notificationId` |
| **Log** | `log-items` | `entryId` |
| **Measure** | `measure-items` | `bucket + entryKey` |
| **Interval** | `interval-items` | `bucket + entryKey` |
| **Memory** | `memory-items` | `signalId + bucketName + memoryId` |
| **Recent** | `recent-items` | `symbol + strategyName + exchangeName + frameName + backtest` |
| **State** | `state-items` | `signalId + bucketName` |
| **Session** | `session-items` | `strategyName + exchangeName + frameName` |

Candle records are **immutable** — the first write wins, subsequent writes to the same `(symbol, interval, timestamp)` are silently ignored via `$setOnInsert`. All other adapters use `$set`, so each write replaces the previous value.

Measure, Interval, and Memory support **soft delete** — calling `removeMeasureData` / `removeIntervalData` / `removeMemoryData` sets `removed: true` on the document instead of deleting it. Listing operations filter on `removed: false`.

## ✨ Features

- 🗄️ **MongoDB backend**: all 15 `IPersist*Instance` contracts from backtest-kit implemented with Mongoose
- ⚡ **O(1) reads via Redis**: every context-key lookup goes through ioredis — one `GET` + one `findById`, no B-tree scans
- 🔒 **Atomic writes**: `findOneAndUpdate` with `upsert: true` guarantees read-after-write correctness with no race conditions
- 🛡️ **Look-ahead bias protection**: adapters that affect signal logic store the simulation timestamp so backtest-kit can enforce temporal correctness
- 🪦 **Soft delete**: Measure, Interval, and Memory records are never physically removed — they carry a `removed` flag instead
- 🔌 **Zero strategy changes**: drop `setup()` into your entry point, everything else stays the same

## ⚡ How O(1) Reads Work

Every domain has two layers: a **DbService** that talks to MongoDB and a **CacheService** that talks to Redis.

When the strategy reads state for a given context key (e.g. `symbol + strategyName + exchangeName` for a signal), the DbService first asks Redis for the MongoDB `_id`. If it exists, the document is fetched directly by `_id` — two O(1) operations total. On a cache miss it falls back to a regular indexed MongoDB query, then writes the `_id` to Redis so the next call is instant.

```
read signal for (BTCUSDT, my_strategy, binance)
  │
  ├─ Redis GET  → hit  → Mongo findById(_id)   ← O(1) + O(1)
  │
  └─ Redis GET  → miss → Mongo findOne(filter) → Redis SET → return
```

After every write the Redis entry is updated in the same call, so a write followed immediately by a read always hits the cache.

## 🔒 Atomic Writes

`backtest-kit` requires that once `write*Data()` returns, the very next `read*Data()` must see the new value. Every write is a single `findOneAndUpdate` round-trip to MongoDB:

```typescript
const document = await SignalModel.findOneAndUpdate(
  { symbol, strategyName, exchangeName },
  { $set: { payload } },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);
await signalCacheService.setSignalId(readTransform(document.toJSON()));
```

The filter matches the unique compound index, so MongoDB rejects any concurrent duplicate insert at the storage-engine level. The returned document is immediately written to Redis, making the next read O(1) with the fresh data.

## 🛡️ Look-Ahead Bias Protection

Adapters whose data influences trading decisions (Risk, Partial, Breakeven, Recent, State, Session, Memory, Interval) store `when: Number` — the simulation timestamp in milliseconds — alongside the payload. This lets backtest-kit verify that no read returns data that was written at a future simulation time.

Measure is exempt because it caches LLM and external API responses, where look-ahead bias is not meaningful.

## 🤝 Contribute

Fork/PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
