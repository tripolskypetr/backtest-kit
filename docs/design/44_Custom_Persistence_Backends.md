# Custom Persistence Backends

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [docs/interfaces/IPersistBase.md](docs/interfaces/IPersistBase.md)
- [docs/interfaces/ISignalData.md](docs/interfaces/ISignalData.md)
- [src/index.ts](src/index.ts)
- [types.d.ts](types.d.ts)

</details>



This page explains how to implement custom persistence backends for signal state storage. By default, the framework uses file-based atomic persistence for crash-safe live trading. Custom backends enable integration with Redis, PostgreSQL, MongoDB, or any other storage system while maintaining crash recovery guarantees.

For general information about signal persistence and crash recovery mechanisms, see [Signal Persistence](#6.3). For implementing custom data sources for candle data, see [Custom Exchange Integration](#11.1).

---

## Persistence Architecture Overview

The persistence layer uses a factory pattern with pluggable backends. The `PersistSignalUtils` class manages storage instances per strategy, while `PersistBase` provides the default file-based implementation.

**Architecture Diagram: Persistence Layer Components**

![Mermaid Diagram](./diagrams\44_Custom_Persistence_Backends_0.svg)

**Sources:** [types.d.ts:1067-1125](), [src/index.ts:44-50]()

---

## The IPersistBase Interface

Custom persistence backends must implement the `IPersistBase<Entity>` interface, which defines four core operations for CRUD functionality.

**Interface Contract**

| Method | Signature | Purpose |
|--------|-----------|---------|
| `waitForInit` | `(initial: boolean) => Promise<void>` | Initialize storage, validate existing data |
| `readValue` | `(entityId: EntityId) => Promise<Entity>` | Read entity by ID, throw if not found |
| `hasValue` | `(entityId: EntityId) => Promise<boolean>` | Check entity existence |
| `writeValue` | `(entityId: EntityId, entity: Entity) => Promise<void>` | Write entity atomically |

**Entity Types for Signal Persistence**

```typescript
// Entity type used for signal storage
interface ISignalData {
    signalRow: ISignalRow | null;  // Nullable for atomic clear
}

// Entity identifier (strategy name used as entity name)
type EntityId = string | number;

// Constructor signature for custom adapters
type TPersistBaseCtor<EntityName, Entity> = 
    new (entityName: EntityName, baseDir: string) => IPersistBase<Entity>;
```

**Sources:** [types.d.ts:926-959](), [types.d.ts:899-903](), [types.d.ts:912]()

---

## Default File-Based Implementation

The `PersistBase` class provides the default implementation using atomic file writes to prevent corruption during crashes.

**Default Implementation Flow**

![Mermaid Diagram](./diagrams\44_Custom_Persistence_Backends_1.svg)

**Key Features of PersistBase**

- **Atomic Writes:** Uses `writeFileAtomic` to write to temporary file then rename, preventing partial writes during crashes
- **Auto-Validation:** On `waitForInit()`, validates existing JSON files and removes corrupted ones
- **Directory Structure:** `./signals/{strategyName}/{symbol}.json` for each signal
- **Async Generators:** Provides `values()`, `keys()`, `filter()`, `take()` for iteration
- **Singleshot Initialization:** `waitForInit()` uses memoization to run only once per instance

**Sources:** [types.d.ts:977-1055]()

---

## Implementing Custom Persistence Adapters

Custom adapters extend or implement the `IPersistBase<ISignalData>` interface. The constructor must accept `entityName` (strategy name) and `baseDir` (configuration directory).

**Implementation Requirements Diagram**

![Mermaid Diagram](./diagrams\44_Custom_Persistence_Backends_2.svg)

**Example: Redis Persistence Adapter**

```typescript
import { PersistBase, IPersistBase, ISignalData } from 'backtest-kit';
import Redis from 'ioredis';

class RedisPersistAdapter implements IPersistBase<ISignalData> {
    private redis: Redis;
    private keyPrefix: string;
    
    constructor(
        public entityName: string,
        public baseDir: string
    ) {
        // entityName = strategy name, baseDir = config directory
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
        });
        this.keyPrefix = `signals:${entityName}:`;
    }
    
    async waitForInit(initial: boolean): Promise<void> {
        // Test connection
        await this.redis.ping();
        // Optional: Create indexes, validate schema
    }
    
    async readValue(entityId: string | number): Promise<ISignalData> {
        const key = `${this.keyPrefix}${entityId}`;
        const data = await this.redis.get(key);
        
        if (!data) {
            throw new Error(`Entity ${entityId} not found`);
        }
        
        return JSON.parse(data);
    }
    
    async hasValue(entityId: string | number): Promise<boolean> {
        const key = `${this.keyPrefix}${entityId}`;
        const exists = await this.redis.exists(key);
        return exists === 1;
    }
    
    async writeValue(
        entityId: string | number, 
        entity: ISignalData
    ): Promise<void> {
        const key = `${this.keyPrefix}${entityId}`;
        
        // Atomic write using Redis transaction
        const multi = this.redis.multi();
        
        if (entity.signalRow === null) {
            // Clear signal
            multi.del(key);
        } else {
            // Set signal with expiration (optional)
            multi.set(key, JSON.stringify(entity));
            multi.expire(key, 86400 * 7); // 7 days TTL
        }
        
        await multi.exec();
    }
}
```

**Sources:** [types.d.ts:912](), [types.d.ts:926-959](), [types.d.ts:1067-1108]()

---

## Registration and Lifecycle

Custom adapters are registered globally via `PersistSignalAdaper.usePersistSignalAdapter()`. This must be called before any backtest or live trading execution.

**Registration Flow**

![Mermaid Diagram](./diagrams\44_Custom_Persistence_Backends_3.svg)

**Registration Code Example**

```typescript
import { PersistSignalAdaper } from 'backtest-kit';
import { RedisPersistAdapter } from './adapters/RedisPersistAdapter';

// Register custom adapter BEFORE running strategies
PersistSignalAdaper.usePersistSignalAdapter(RedisPersistAdapter);

// Now all live trading will use Redis for persistence
import { Live } from 'backtest-kit';

for await (const result of Live.run("BTCUSDT", {
    strategyName: "my-strategy",
    exchangeName: "binance",
})) {
    // Signals are persisted to Redis, not file system
    console.log(result);
}
```

**Sources:** [types.d.ts:1067-1125](), [src/index.ts:49]()

---

## Integration Patterns

Different storage backends have different characteristics. Choose based on your operational requirements.

**Storage Backend Comparison**

| Backend | Atomicity | Durability | Performance | Use Case |
|---------|-----------|------------|-------------|----------|
| **File System** (default) | ✅ Atomic rename | ✅ fsync | Medium | Single-instance deployments |
| **Redis** | ✅ MULTI/EXEC | ⚠️ Configurable | Very High | Distributed, high-throughput |
| **PostgreSQL** | ✅ Transactions | ✅ WAL | Medium | Multi-strategy orchestration |
| **MongoDB** | ✅ Write concern | ✅ Journal | High | Document-oriented storage |

**PostgreSQL Adapter Pattern**

```typescript
import { IPersistBase, ISignalData } from 'backtest-kit';
import { Pool } from 'pg';

class PostgresPersistAdapter implements IPersistBase<ISignalData> {
    private pool: Pool;
    private tableName: string;
    
    constructor(
        public entityName: string,
        public baseDir: string
    ) {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
        });
        this.tableName = `signals_${entityName}`;
    }
    
    async waitForInit(initial: boolean): Promise<void> {
        // Create table if not exists
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                entity_id TEXT PRIMARY KEY,
                signal_row JSONB,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
    }
    
    async readValue(entityId: string | number): Promise<ISignalData> {
        const result = await this.pool.query(
            `SELECT signal_row FROM ${this.tableName} WHERE entity_id = $1`,
            [entityId]
        );
        
        if (result.rows.length === 0) {
            throw new Error(`Entity ${entityId} not found`);
        }
        
        return { signalRow: result.rows[0].signal_row };
    }
    
    async hasValue(entityId: string | number): Promise<boolean> {
        const result = await this.pool.query(
            `SELECT 1 FROM ${this.tableName} WHERE entity_id = $1`,
            [entityId]
        );
        return result.rows.length > 0;
    }
    
    async writeValue(
        entityId: string | number, 
        entity: ISignalData
    ): Promise<void> {
        // Upsert with transaction
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            
            if (entity.signalRow === null) {
                await client.query(
                    `DELETE FROM ${this.tableName} WHERE entity_id = $1`,
                    [entityId]
                );
            } else {
                await client.query(`
                    INSERT INTO ${this.tableName} (entity_id, signal_row)
                    VALUES ($1, $2)
                    ON CONFLICT (entity_id) 
                    DO UPDATE SET 
                        signal_row = $2,
                        updated_at = NOW()
                `, [entityId, JSON.stringify(entity.signalRow)]);
            }
            
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
```

**Sources:** [types.d.ts:926-959](), [types.d.ts:899-903]()

---

## Testing Custom Adapters

Custom adapters should be thoroughly tested for atomicity, crash recovery, and concurrent access patterns.

**Test Requirements**

![Mermaid Diagram](./diagrams\44_Custom_Persistence_Backends_4.svg)

**Example Test Suite**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { RedisPersistAdapter } from './RedisPersistAdapter';
import { ISignalData } from 'backtest-kit';

describe('RedisPersistAdapter', () => {
    let adapter: RedisPersistAdapter;
    const entityName = 'test-strategy';
    const symbol = 'BTCUSDT';
    
    beforeEach(async () => {
        adapter = new RedisPersistAdapter(entityName, './test-config');
        await adapter.waitForInit(true);
    });
    
    it('should write and read signal data', async () => {
        const signalData: ISignalData = {
            signalRow: {
                id: 'test-123',
                position: 'long',
                priceOpen: 50000,
                priceTakeProfit: 51000,
                priceStopLoss: 49000,
                minuteEstimatedTime: 60,
                exchangeName: 'binance',
                strategyName: entityName,
                timestamp: Date.now(),
                symbol: symbol,
            }
        };
        
        await adapter.writeValue(symbol, signalData);
        const result = await adapter.readValue(symbol);
        
        expect(result.signalRow).toEqual(signalData.signalRow);
    });
    
    it('should handle null signalRow (clear operation)', async () => {
        // Write signal first
        await adapter.writeValue(symbol, { signalRow: { /* ... */ } });
        
        // Clear signal
        await adapter.writeValue(symbol, { signalRow: null });
        
        // Should not exist after clear
        const exists = await adapter.hasValue(symbol);
        expect(exists).toBe(false);
    });
    
    it('should throw on readValue for non-existent entity', async () => {
        await expect(
            adapter.readValue('NONEXISTENT')
        ).rejects.toThrow('Entity NONEXISTENT not found');
    });
    
    it('should handle concurrent writes without race conditions', async () => {
        const promises = Array.from({ length: 100 }, (_, i) =>
            adapter.writeValue(`symbol-${i}`, {
                signalRow: {
                    id: `test-${i}`,
                    // ... other fields
                }
            })
        );
        
        await Promise.all(promises);
        
        // Verify all were written
        for (let i = 0; i < 100; i++) {
            const exists = await adapter.hasValue(`symbol-${i}`);
            expect(exists).toBe(true);
        }
    });
});
```

**Sources:** [types.d.ts:926-959](), [types.d.ts:899-903]()

---

## Advanced Patterns

### Adapter with Caching Layer

Implement in-memory caching to reduce backend calls for frequently accessed signals.

```typescript
class CachedRedisPersistAdapter implements IPersistBase<ISignalData> {
    private cache = new Map<string, ISignalData>();
    private redis: Redis;
    
    async readValue(entityId: string | number): Promise<ISignalData> {
        const key = String(entityId);
        
        // Check cache first
        if (this.cache.has(key)) {
            return this.cache.get(key)!;
        }
        
        // Fallback to Redis
        const data = await this.readFromRedis(entityId);
        this.cache.set(key, data);
        return data;
    }
    
    async writeValue(entityId: string | number, entity: ISignalData): Promise<void> {
        const key = String(entityId);
        
        // Write-through: update cache and Redis
        this.cache.set(key, entity);
        await this.writeToRedis(entityId, entity);
    }
}
```

### Multi-Region Replication

Implement replication across multiple regions for disaster recovery.

```typescript
class ReplicatedPersistAdapter implements IPersistBase<ISignalData> {
    private primaryAdapter: IPersistBase<ISignalData>;
    private replicaAdapters: IPersistBase<ISignalData>[];
    
    async writeValue(entityId: string | number, entity: ISignalData): Promise<void> {
        // Write to primary first (blocking)
        await this.primaryAdapter.writeValue(entityId, entity);
        
        // Write to replicas asynchronously (non-blocking)
        Promise.all(
            this.replicaAdapters.map(adapter => 
                adapter.writeValue(entityId, entity).catch(err => {
                    console.error('Replica write failed:', err);
                })
            )
        );
    }
    
    async readValue(entityId: string | number): Promise<ISignalData> {
        // Always read from primary for consistency
        return this.primaryAdapter.readValue(entityId);
    }
}
```

**Sources:** [types.d.ts:926-959](), [types.d.ts:1067-1125]()

---

## Summary

Custom persistence backends enable flexible storage solutions while maintaining crash recovery guarantees. Key implementation requirements:

1. **Implement `IPersistBase<ISignalData>`** with four core methods
2. **Constructor signature** must accept `(entityName: string, baseDir: string)`
3. **Atomic writes** are critical for crash safety - use transactions or atomic operations
4. **Register globally** via `PersistSignalAdaper.usePersistSignalAdapter()` before execution
5. **Test thoroughly** for atomicity, crash recovery, and concurrent access

The memoized factory pattern ensures single instances per strategy, and the nullable `signalRow` design enables atomic state clearing for proper signal lifecycle management.

**Sources:** [types.d.ts:899-1125](), [src/index.ts:44-50]()