<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/consciousness.svg" height="45px" align="right">

# 💾 @backtest-kit/mongo

> MongoDB + Redis persistence for [backtest-kit](https://www.npmjs.com/package/backtest-kit). Swaps the default file storage for a production backend — durable, queryable, atomic, with O(1) cached reads — in **one `setup()` call and zero strategy-code changes**.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/mongo.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/mongo)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

📚 **[Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** · 🌟 **[Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)** · 🐙 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

```bash
npm install @backtest-kit/mongo backtest-kit mongoose ioredis
```

```typescript
import { setup } from '@backtest-kit/mongo';
setup(); // reads connection settings from env; call once before any trading operation
```

That single call reimplements all **16** of backtest-kit's `IPersist*Instance` contracts against MongoDB (source of truth) with a Redis O(1) read cache. Your strategy code does not change.

---

## Why

File storage is perfect on day one and a bottleneck the day you're doing thousands of context-keyed reads per second across parallel symbols. This package moves persistence to MongoDB without touching strategy logic: every read goes Redis-first for the Mongo `_id` (two O(1) hops), every write is one atomic `findOneAndUpdate` upsert (read-after-write guaranteed, concurrent duplicates rejected by the unique index), and adapters whose data drives decisions store the simulation timestamp so **look-ahead protection is enforceable even inside the database**.

- 🗄️ **MongoDB backend** — all 16 `IPersist*Instance` contracts implemented with Mongoose.
- ⚡ **O(1) reads via Redis** — one `GET` + one `findById`, no B-tree scans on the hot path.
- 🔒 **Atomic writes** — `findOneAndUpdate({ upsert:true, new:true })` guarantees read-after-write with no race.
- 🛡️ **Look-ahead protection** — decision-affecting adapters store the simulation `when`.
- 🪦 **Soft delete** — Measure / Interval / Memory carry a `removed` flag instead of being deleted (audit trail).
- 🔌 **Zero strategy changes** — drop `setup()` into your entry point; everything else stays the same.

---

## Configuration

<details>
<summary>Explicit parameters & environment variables</summary>

```typescript
import { setup } from '@backtest-kit/mongo';
setup({
  CC_MONGO_CONNECTION_STRING: 'mongodb://mongo:27017/mydb',
  CC_REDIS_HOST: 'redis', CC_REDIS_PORT: 6379, CC_REDIS_PASSWORD: 'secret',
});
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_MONGO_CONNECTION_STRING` | `mongodb://localhost:27017/backtest-kit?wtimeoutMS=15000` | MongoDB connection string |
| `CC_REDIS_HOST` | `127.0.0.1` | Redis host |
| `CC_REDIS_PORT` | `6379` | Redis port |
| `CC_REDIS_USER` | _(empty)_ | Redis username |
| `CC_REDIS_PASSWORD` | _(empty)_ | Redis password |

Values passed to `setup()` / `setConfig()` always take precedence over env vars. Within the CLI, put `setup()` in `config/setup.config.ts` — when present, the CLI skips its default file-adapter registration and your config owns persistence.

</details>

---

## API reference

| Export | Description |
|--------|-------------|
| `setup(config?)` | Configure **and** register all 16 adapters in one call. Reads env when `config` omitted. |
| `install()` | Register adapters only — when config was already applied via `setConfig`/env. |
| `setConfig(config)` | Override individual connection parameters at runtime. |
| `getConfig()` | The current merged configuration (env + any `setConfig` overrides). |
| `setLogger(logger)` | Replace the internal logger with your own implementation. |
| `getMongo()` | The connected Mongoose instance (lazy singleton). |
| `getRedis()` | The connected ioredis instance (lazy singleton). |

---

## The 16 adapters

Each adapter covers one persistence slot in backtest-kit. The unique index is the compound key MongoDB enforces at the storage engine.

| Adapter | Collection | Unique index |
|---------|------------|--------------|
| **Candle** | `candle-items` | `symbol + interval + timestamp` |
| **Signal** | `signal-items` | `symbol + strategyName + exchangeName` |
| **Strategy** | `strategy-items` | `symbol + strategyName + exchangeName` |
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

<details>
<summary>Write semantics — immutable, mutable, soft-delete</summary>

- **Candle is immutable** — first write wins; subsequent writes to the same `(symbol, interval, timestamp)` are silently ignored via `$setOnInsert` (historical OHLCV never changes).
- **All others use `$set`** — each write replaces the previous value.
- **Measure / Interval / Memory soft-delete** — `removeMeasureData` / `removeIntervalData` / `removeMemoryData` set `removed: true` rather than deleting; listings filter on `removed: false`, keeping a full audit trail.

</details>

---

## How it works

<details>
<summary>O(1) reads — DbService + CacheService per domain</summary>

Every domain is two layers: a **DbService** (MongoDB) and a **CacheService** (Redis). Reading state for a context key asks Redis for the Mongo `_id` first; a hit is two O(1) ops, a miss falls back to an indexed `findOne` and backfills Redis.

```
read signal for (BTCUSDT, my_strategy, binance)
  ├─ Redis GET → hit  → Mongo findById(_id)        ← O(1) + O(1)
  └─ Redis GET → miss → Mongo findOne(filter) → Redis SET → return
```

After every write the Redis entry is refreshed in the same call, so write-then-read always hits the cache.

</details>

<details>
<summary>Atomic writes — read-after-write with no race</summary>

backtest-kit requires that once `write*Data()` returns, the next `read*Data()` sees the new value. Every write is one `findOneAndUpdate` round-trip:

```typescript
const document = await SignalModel.findOneAndUpdate(
  { symbol, strategyName, exchangeName },
  { $set: { payload } },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);
await signalCacheService.setSignalId(readTransform(document.toJSON()));
```

The filter matches the unique compound index, so MongoDB rejects any concurrent duplicate insert at the storage engine; the returned document is written straight to Redis, making the next read O(1) on fresh data.

</details>

<details>
<summary>Look-ahead bias protection in the DB layer</summary>

Adapters whose data influences decisions (Risk, Partial, Breakeven, Recent, State, Session, Memory, Interval) store `when: Number` — the simulation timestamp in ms — alongside the payload, so backtest-kit can verify no read returns data written at a *future* simulation time. **Measure is exempt** because it caches LLM / external-API responses, where look-ahead bias is not meaningful.

</details>

---

## Internal architecture (complete source map)

<details>
<summary>Layers & files</summary>

**Public surface** — `functions/setup.ts` (`setup`/`install`/`setConfig`/`getConfig`/`setLogger`), `index.ts` re-exports + `getMongo`/`getRedis`.

**Adapter classes** (`classes/Persist*Instance.ts`, 16) — each implements one backtest-kit `IPersist*Instance` contract and delegates to its domain DbService: `PersistCandleInstance`, `PersistSignalInstance`, `PersistStrategyInstance`, `PersistScheduleInstance`, `PersistRiskInstance`, `PersistPartialInstance`, `PersistBreakevenInstance`, `PersistStorageInstance`, `PersistNotificationInstance`, `PersistLogInstance`, `PersistMeasureInstance`, `PersistIntervalInstance`, `PersistMemoryInstance`, `PersistRecentInstance`, `PersistStateInstance`, `PersistSessionInstance`.

**Service layer** (`lib/services/`):
- `base/` — `MongoService` (lazy Mongoose connection), `RedisService` (lazy ioredis), `LoggerService`.
- `db/` — one `*DbService` per domain: the Mongoose models, schemas, unique compound indexes, and `findOneAndUpdate` upsert logic.
- `cache/` — one `*CacheService` per domain (`CandleCacheService`, `SignalCacheService`, `BreakevenCacheService`, `IntervalCacheService`, `LogCacheService`, `MeasureCacheService`, `MemoryCacheService`, `NotificationCacheService`, `PartialCacheService`, `RecentCacheService`, …): Redis `_id` mapping for O(1) lookups.

**Shared primitives** (`lib/common/`) — `BaseCRUD` (the upsert/read/remove pattern every DbService reuses) and `BaseMap` (the Redis key-mapping pattern every CacheService reuses).

**DI & config** — `lib/core/{di,provide,types}.ts` (IoC container wiring Db/Cache/base services), `lib/index.ts` (container bootstrap), `config/{mongo,redis,params}.ts` (connection builders + merged params), `interfaces/Logger.interface.ts`.

</details>

## 🤝 Contribute

Fork / PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
