<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/consciousness.svg" height="45px" align="right">

# 🐘 @backtest-kit/pg

> PostgreSQL + Redis persistence for [backtest-kit](https://www.npmjs.com/package/backtest-kit). Swaps the default file storage for a production backend — durable, queryable, atomic, with O(1) cached reads — in **one `setup()` call and zero strategy-code changes**.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/pg.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/pg)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

📚 **[Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** · 🌟 **[Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)** · 🐙 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

```bash
npm install @backtest-kit/pg backtest-kit typeorm pg ioredis reflect-metadata
```

```typescript
import { setup } from '@backtest-kit/pg';
setup(); // reads connection settings from env; call once before any trading operation
```

That single call reimplements all **16** of backtest-kit's `IPersist*Instance` contracts against PostgreSQL (source of truth) with a Redis O(1) read cache. Your strategy code does not change.

---

## Why

**The single-node atomicity illusion.** On a lone Postgres node all concurrency is arbitrated internally by row locks and MVCC, so even a sloppy `write` followed by a *separate* `SELECT` looks correct — the read hits the very process that just committed. Add read replicas and the illusion breaks: a follow-up `SELECT` can be routed to an async replica that has not yet received the commit, silently returning stale data. This package tunes every operation for Pgpool to squeeze out maximum throughput while shedding needless locking. The returned row seeds a Redis-first `id` cache: O(1) per read.

**Pgpool-II fans the read load across the cluster.** A backtest fires thousands of context-keyed reads per second across parallel symbols. Writes still serialize on the primary (where the atomic upsert keeps its read-after-write guarantee), while the read-heavy hot path scales horizontally with every replica you add.

**Up to ~4× faster than the MongoDB adapter.** On an Apple M2, simulating one minute of market data costs **35–40 ms** through the single-node MongoDB adapter but only **~10 ms** through this Postgres + Pgpool cluster — the replicas absorb the read fan-out that otherwise bottlenecks a single node. Your strategy code doesn't change; only the wall-clock time to grind through a backtest does.

- 🗄️ **PostgreSQL backend** — all 16 `IPersist*Instance` contracts implemented with TypeORM.
- ⚡ **O(1) reads via Redis** — one `GET` + one primary-key lookup, no B-tree scans on the hot path.
- 🔒 **Atomic writes** — `INSERT … ON CONFLICT DO UPDATE … RETURNING *` guarantees read-after-write with no race.
- 🛡️ **Look-ahead protection** — decision-affecting adapters store the simulation `when`.
- 🪦 **Soft delete** — Measure / Interval / Memory carry a `removed` flag instead of being deleted (audit trail).
- 🔌 **Zero strategy changes** — drop `setup()` into your entry point; everything else stays the same.

---

## Configuration

<details>
<summary>Explicit parameters & environment variables</summary>

```typescript
import { setup } from '@backtest-kit/pg';
setup({
  CC_POSTGRES_CONNECTION_STRING: 'postgres://backtest:secret@postgres:5432/mydb',
  CC_REDIS_HOST: 'redis', CC_REDIS_PORT: 6379, CC_REDIS_PASSWORD: 'secret',
});
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_POSTGRES_CONNECTION_STRING` | `postgres://backtest:mysecurepassword@localhost:5432/backtest-pro` | PostgreSQL connection string |
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
| `getPostgres()` | The connected TypeORM `DataSource` (lazy singleton). |
| `getRedis()` | The connected ioredis instance (lazy singleton). |

---

## The 16 adapters

Each adapter covers one persistence slot in backtest-kit. The unique index is the compound key PostgreSQL enforces at the storage engine.

| Adapter | Table | Unique index |
|---------|------------|--------------|
| **Candle** | `candle-items` | `exchangeName + symbol + interval + timestamp` |
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

- **Candle is immutable** — first write wins; subsequent writes to the same `(exchangeName, symbol, interval, timestamp)` are silently ignored via a no-op `DO UPDATE` that never touches the OHLCV columns (historical OHLCV never changes).
- **All others use `DO UPDATE SET payload = EXCLUDED.payload`** — each write replaces the previous value.
- **Measure / Interval / Memory soft-delete** — `removeMeasureData` / `removeIntervalData` / `removeMemoryData` set `removed = true` rather than deleting; listings filter on `removed = false`, keeping a full audit trail.

</details>

---

## How it works

<details>
<summary>O(1) reads — DbService + CacheService per domain</summary>

Every domain is two layers: a **DbService** (PostgreSQL) and a **CacheService** (Redis). Reading state for a context key asks Redis for the Postgres `id` first; a hit is two O(1) ops, a miss falls back to an indexed `findOne` and backfills Redis.

```
read signal for (BTCUSDT, my_strategy, binance)
  ├─ Redis GET → hit  → Postgres findByFilter({ id })   ← O(1) + O(1)
  └─ Redis GET → miss → Postgres findByFilter(filter) → Redis SET → return
```

After every write the Redis entry is refreshed in the same call, so write-then-read always hits the cache.

</details>

<details>
<summary>Atomic writes — read-after-write with no race</summary>

backtest-kit requires that once `write*Data()` returns, the next `read*Data()` sees the new value. Every write is one `INSERT … ON CONFLICT … RETURNING` round-trip:

```typescript
const { raw } = await repo
  .createQueryBuilder()
  .insert()
  .values({ symbol, strategyName, exchangeName, payload })
  .orUpdate(["payload"], ["symbol", "strategyName", "exchangeName"])
  .returning("*")
  .execute();
await signalCacheService.setSignalId(raw[0]);
```

The conflict target matches the unique compound index, so PostgreSQL serializes any concurrent duplicate insert at the storage engine — the loser takes the `DO UPDATE` branch instead of throwing; the returned row is written straight to Redis, making the next read O(1) on fresh data.

</details>

<details>
<summary>Look-ahead bias protection in the DB layer</summary>

Adapters whose data influences decisions (Risk, Partial, Breakeven, Recent, State, Session, Memory, Interval) store `when: bigint` — the simulation timestamp in ms — alongside the payload, so backtest-kit can verify no read returns data written at a *future* simulation time. **Measure is exempt** because it caches LLM / external-API responses, where look-ahead bias is not meaningful.

</details>

---

## Internal architecture (complete source map)

<details>
<summary>Layers & files</summary>

**Public surface** — `functions/setup.ts` (`setup`/`install`/`setLogger`), `config/params.ts` (`setConfig`/`getConfig`), `index.ts` re-exports + `getPostgres`/`getRedis`.

**Adapter classes** (`classes/Persist*Instance.ts`, 16) — each implements one backtest-kit `IPersist*Instance` contract and delegates to its domain DbService: `PersistCandleInstance`, `PersistSignalInstance`, `PersistStrategyInstance`, `PersistScheduleInstance`, `PersistRiskInstance`, `PersistPartialInstance`, `PersistBreakevenInstance`, `PersistStorageInstance`, `PersistNotificationInstance`, `PersistLogInstance`, `PersistMeasureInstance`, `PersistIntervalInstance`, `PersistMemoryInstance`, `PersistRecentInstance`, `PersistStateInstance`, `PersistSessionInstance`.

**Service layer** (`lib/services/`):
- `base/` — `PostgresService` (lazy TypeORM `DataSource`), `RedisService` (lazy ioredis), `LoggerService`.
- `db/` — one `*DbService` per domain: the TypeORM entity schemas, unique compound indexes, and `INSERT … ON CONFLICT … RETURNING` upsert logic.
- `cache/` — one `*CacheService` per domain (`CandleCacheService`, `SignalCacheService`, `BreakevenCacheService`, `IntervalCacheService`, `LogCacheService`, `MeasureCacheService`, `MemoryCacheService`, `NotificationCacheService`, `PartialCacheService`, `RecentCacheService`, …): Redis `id` mapping for O(1) lookups.

**Shared primitives** (`lib/common/`) — `BaseCRUD` (the upsert/read/remove pattern every DbService reuses) and `BaseMap` (the Redis key-mapping pattern every CacheService reuses).

**DI & config** — `lib/core/{di,provide,types}.ts` (IoC container wiring Db/Cache/base services), `lib/index.ts` (container bootstrap), `config/{postgres,redis,params}.ts` (connection builders + merged params), `interfaces/Logger.interface.ts`.

</details>

## 🤝 Contribute

Fork / PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
