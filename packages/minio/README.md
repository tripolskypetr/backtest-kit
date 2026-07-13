<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/consciousness.svg" height="45px" align="right">

# 🪣 @backtest-kit/minio

> MinIO (S3) + Redis persistence for [backtest-kit](https://www.npmjs.com/package/backtest-kit). Swaps the default file storage for **S3 objects as the source of truth** with **Redis as a time-ordered index** — durable, replicable, schema-free — in **one `setup()` call and zero strategy-code changes**.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/minio.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/minio)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

📚 **[Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** · 🌟 **[Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)** · 🐙 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

```bash
npm install @backtest-kit/minio backtest-kit minio ioredis
```

```typescript
import { setup } from '@backtest-kit/minio';
setup(); // reads connection settings from env; call once before any trading operation
```

That single call reimplements all **15** of backtest-kit's `IPersist*Instance` contracts against MinIO (source of truth) with a Redis time-ordered index for newest-first listings. Your strategy code does not change.

---

## Why

An exotic but deliberate middle ground between the built-in file adapter and a full database. S3 gives strong read-after-write consistency for single objects, and every record's key in backtest-kit is a pure function of its context — so the write durability contract holds with plain object semantics, no transactions and no schema at all:

| | Default file `./dump/` | **MinIO + Redis (this package)** | [`@backtest-kit/mongo`](https://www.npmjs.com/package/@backtest-kit/mongo) / [`@backtest-kit/pg`](https://www.npmjs.com/package/@backtest-kit/pg) |
|---|---|---|---|
| Infrastructure | none | 2 containers | database + Redis cache |
| Source of truth | JSON files on local disk | JSON objects in S3 bucket | rows / documents |
| Durability & ops | single host, manual backup | S3 semantics: versioning, replication, `mc mirror`, lifecycle | DB tooling: dumps, replicas |
| Newest-first listings | directory scan | Redis minute-index, O(limit) | `ORDER BY … LIMIT`, O(log n) |
| Point reads (candles) | `fs.readFile` | 1 GET ≈ 1–3 ms | b-tree lookup ≈ 0.1–1 ms |
| Sweet spot | local runs, CI | fat JSON snapshots, cheap unbounded archive, S3-native infra | hundreds of millions of candles, ad-hoc SQL/aggregation |

Pick this variant when you want S3-grade durability and zero schema management, but a full DBMS would be overkill. If your candle set grows into the hundreds of millions, take the `pg`/`mongo` package instead — b-trees win that workload.

- 🪣 **MinIO backend** — all 15 `IPersist*Instance` contracts implemented as JSON objects in a single S3 bucket.
- 🔑 **Deterministic object keys** — every key is a pure function of its context, so an upsert is one idempotent `PUT`: no read-before-write, no duplicate-key races.
- ⚡ **Newest-first listings via Redis** — a per-minute Redis index answers "what was created last" in O(limit), independent of bucket size.
- 🛡️ **Look-ahead protection** — decision-affecting adapters store the simulation `when`.
- 🪦 **`removed` means absent** — soft-delete entities physically delete the object; listings stay pure prefix LISTs with zero body reads.
- 🔌 **Zero strategy changes** — drop `setup()` into your entry point; everything else stays the same.

---

## Configuration

<details>
<summary>Explicit parameters & environment variables</summary>

```typescript
import { setup } from '@backtest-kit/minio';
setup({
  CC_MINIO_ENDPOINT: 'minio', CC_MINIO_PORT: 9000,
  CC_MINIO_ACCESSKEY: 'minioadmin', CC_MINIO_SECRETKEY: 'secret',
  CC_REDIS_HOST: 'redis', CC_REDIS_PORT: 6379, CC_REDIS_PASSWORD: 'secret',
});
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_MINIO_ENDPOINT` | `localhost` | MinIO / S3 endpoint host |
| `CC_MINIO_PORT` | `9000` | MinIO / S3 port |
| `CC_MINIO_ACCESSKEY` | `minioadmin` | MinIO access key |
| `CC_MINIO_SECRETKEY` | `minioadmin` | MinIO secret key |
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
| `setup(config?)` | Configure **and** register all 15 adapters in one call. Reads env when `config` omitted. |
| `install()` | Register adapters only — when config was already applied via `setConfig`/env. |
| `setConfig(config)` | Override individual connection parameters at runtime. |
| `getConfig()` | The current merged configuration (env + any `setConfig` overrides). |
| `setLogger(logger)` | Replace the internal logger with your own implementation. |
| `getMinio()` | The connected MinIO `Client` (lazy singleton). |
| `getRedis()` | The connected ioredis instance (lazy singleton). |
| `waitForInit()` | Gate first-touch on infrastructure readiness (Redis ping; the MinIO client connects lazily per bucket). |
| `BaseStorage` | The S3 object-store primitive every data service extends — reusable for your own buckets. |
| `BaseMap` | The Redis key-mapping primitive behind the time-ordered index. |

---

## The 15 adapters

Each adapter covers one persistence slot in backtest-kit. Everything lives in **one MinIO bucket `backtest-kit`** — each entity gets a root folder, and the object key is the compound context key the entity is addressed by.

| Adapter | Folder | Object key |
|---------|--------|------------|
| **Candle** | `candle-items/` | `exchange/symbol/interval/timestamp` |
| **Signal** | `signal-items/` | `symbol/strategy/exchange` |
| **Schedule** | `schedule-items/` | `symbol/strategy/exchange` |
| **Risk** | `risk-items/` | `riskName/exchange` |
| **Partial** | `partial-items/` | `symbol/strategy/exchange/signalId` |
| **Breakeven** | `breakeven-items/` | `symbol/strategy/exchange/signalId` |
| **Storage** | `storage-items/` | `backtest/signalId` † |
| **Notification** | `notification-items/` | `backtest/⟲ts_notificationId` † |
| **Log** | `log-items/` | `⟲ts_entryId` † |
| **Measure** | `measure-items/` | `bucket/entryKey` |
| **Interval** | `interval-items/` | `bucket/entryKey` |
| **Memory** | `memory-items/` | `signalId/bucket/memoryId` |
| **Recent** | `recent-items/` | `symbol/strategy/exchange/frame/backtest` |
| **State** | `state-items/` | `signalId/bucket` |
| **Session** | `session-items/` | `strategy/exchange/frame/symbol/backtest` |

`⟲ts` = inverted timestamp (`MAX_SAFE_INTEGER − ms`, zero-padded): plain lexicographic S3 listing yields **newest first** with no sorting. † = entity also maintained in the Redis time index (see below).

<details>
<summary>Write semantics — immutable, mutable, physically deleted</summary>

- **Candle is immutable** — first write wins; the insert is a `stat` + `PUT` pair, so a repeated write of the same `(exchange, symbol, interval, timestamp)` costs one HEAD and never downloads or rewrites the body (historical OHLCV never changes).
- **Log / Notification entries are immutable events** — the library re-sends the whole accumulated list on every write, so an in-process FIFO-capped index of persisted keys skips the `PUT` entirely when the key already exists: re-sending costs zero network in steady state.
- **All others rewrite the object** — each write is one idempotent `PUT` under the stable context key.
- **Measure / Interval / Memory delete physically** — `removed: true` translates to a `DELETE` instead of a tombstone. `listKeys` is then a pure prefix LIST with zero body reads, and reads of removed entries return `null` by construction.

</details>

---

## How it works

<details>
<summary>Write durability without a database</summary>

backtest-kit has a **write durability contract**: after `writeXData(...)` returns, the very next `readXData(...)` must see the just-written value. S3 gives strong read-after-write consistency for single objects, so the contract holds with plain object semantics — no transactions needed:

1. **Deterministic keys.** Every record's object key is a pure function of its context (`symbol/strategy/exchange/…`), so an upsert is a single idempotent `PUT` — no read-before-write, no duplicate-key races.
2. **Immutable entities never rewrite.** Candles use a `stat` + `PUT` insert-only pair; log entries and notifications skip the `PUT` entirely when the key already exists.
3. **Write order: MinIO first, Redis second.** A crash between the two leaves an object readable by key but invisible to listings — never a phantom entry pointing at nothing.
4. **`removed` means absent.** Soft-delete entities (Measure, Interval, Memory) physically delete the object instead of writing a tombstone.

```typescript
// src/lib/services/data/CandleDataService.ts — insert-only, one stat + one PUT
public create = async (dto: ICandleDto): Promise<ICandleRow> => {
  const key = GET_STORAGE_KEY_FN(dto.exchangeName, dto.symbol, dto.interval, dto.timestamp);
  const row: ICandleRow = { id: key, ...dto, /* dates */ };
  if (await this.has(key)) return row;   // candles are immutable — no body download
  await this.set(key, row);
  return row;
};
```

</details>

<details>
<summary>Redis as a time-ordered index</summary>

S3 can list keys only in lexicographic order and cannot answer "what was created last" without walking the bucket. For the three entities that need newest-first listings (Log, Notification, Storage), a `*ConnectionService` maintains a Redis index:

- **One Redis SET per minute**: `<entity>-connection:<aligned-minute>` → object names. `register()` is a single pipeline (`SADD` + `SETNX` of the floor marker). Timestamps are minute-aligned, so re-registering within a minute deduplicates by construction.
- **`listNewest(limit, prefix)` walks backwards from the current minute** — direct key lookups, no `SCAN` over the keyspace. Minutes are probed in pipelines of 1000; a cheap `SCARD` pass skips empty minutes without transferring a single member; hot minutes (a fast backtest replay packs many records into one wall-clock minute) are paged via `SSCAN` with early exit at `limit`.
- **Cold-index fallback.** If Redis was flushed, listings fall back to the bucket LIST (inverted-timestamp keys are already newest-first) and warm the index back up.

Steady-state cost of `readLogData` at startup: 1 RTT for the floor + 1–2 pipeline RTTs + ≤200 point GETs for bodies — independent of how many objects the bucket holds.

```typescript
// src/lib/services/data/LogDataService.ts — read path
const names = await this.logConnectionService.listNewest(LIST_LIMIT);
if (names.length) {
  for (const name of names) rows.push(await this.get<ILogRow>(name));
} else {
  for await (const value of this.values("", LIST_LIMIT)) { /* fallback + re-warm */ }
}
```

</details>

<details>
<summary>Look-ahead bias protection in the storage layer</summary>

Adapters whose data influences decisions (Risk, Partial, Breakeven, Recent, State, Session, Memory, Interval) store `when` — the simulation timestamp in ms — alongside the payload, so backtest-kit can verify no read returns data written at a *future* simulation time. **Measure is exempt** because it caches LLM / external-API responses, where look-ahead bias is not meaningful.

</details>

---

## Internal architecture (complete source map)

<details>
<summary>Layers & files</summary>

**Public surface** — `functions/setup.ts` (`setup`/`install`/`setLogger`), `config/params.ts` (`setConfig`/`getConfig`), `index.ts` re-exports + `getMinio`/`getRedis`/`waitForInit`/`BaseStorage`/`BaseMap`.

**Adapter classes** (`classes/Persist*Instance.ts`) — each implements one backtest-kit `IPersist*Instance` contract and delegates to its domain DataService: `PersistCandleInstance`, `PersistSignalInstance`, `PersistScheduleInstance`, `PersistRiskInstance`, `PersistPartialInstance`, `PersistBreakevenInstance`, `PersistStorageInstance`, `PersistNotificationInstance`, `PersistLogInstance`, `PersistMeasureInstance`, `PersistIntervalInstance`, `PersistMemoryInstance`, `PersistRecentInstance`, `PersistStateInstance`, `PersistSessionInstance`.

**Service layer** (`lib/services/`):
- `base/` — `MinioService` (lazy MinIO client, ensures the bucket on first touch), `RedisService` (lazy ioredis), `LoggerService`.
- `data/` — one `*DataService` per domain: the object-key builders and upsert/find/list logic on top of `BaseStorage`.
- `connection/` — `LogConnectionService`, `NotificationConnectionService`, `StorageConnectionService`: the per-minute Redis time index (`register`/`listNewest`).

**Shared primitives** (`lib/common/`) — `BaseStorage` (the S3 object-store pattern every DataService reuses: `bucket/parent-folder` name parsing, JSON `set`/`get`/`has`/`delete`, batched `clear`, streaming `keys`/`values`/`iterate`) and `BaseMap` (the Redis key-mapping pattern every ConnectionService reuses).

**DI & config** — `lib/core/{di,provide,types}.ts` (IoC container wiring data/connection/base services), `lib/index.ts` (container bootstrap), `config/{minio,redis,params}.ts` (connection builders + merged params), `schema/*.schema.ts` (stored row shapes), `interfaces/Logger.interface.ts`.

</details>

## 🤝 Contribute

Fork / PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
