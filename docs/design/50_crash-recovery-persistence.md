---
title: design/50_crash-recovery-persistence
group: design
---

# Crash Recovery & Persistence

This document describes the crash-safe persistence system that enables live trading strategies to survive system crashes, process restarts, and unexpected failures. When a live trading bot restarts, it can seamlessly restore active signals and continue monitoring positions without data loss or duplicate trades.

For information about live trading execution modes, see [Live Trading Mode](./20_execution-modes.md). For custom adapter implementation details, see [Custom Persistence Backends](./46_advanced-features.md).

---

## Purpose and Scope

The persistence system provides **atomic state storage** for live trading operations. It ensures that:

- **Active signals survive crashes**: Opened positions are restored after restart
- **No duplicate trades**: The system recognizes existing positions and doesn't re-open them
- **Clean state management**: Closed signals are automatically removed from storage
- **Pluggable backends**: Default file-based storage can be replaced with Redis, MongoDB, or custom solutions

**Critical Design Principle**: Only **opened** (active) signals are persisted. Scheduled signals (limit orders waiting for activation) are ephemeral and not saved to storage. This prevents data bloat and ensures the persistence layer only tracks real positions.

---

## Persistence Architecture

The framework provides four specialized persistence adapters, each responsible for a different aspect of trading state:

![Mermaid Diagram](./diagrams\50_crash-recovery-persistence_0.svg)


### Adapter Responsibilities

| Adapter | Purpose | Persists When | Key Data |
|---------|---------|---------------|----------|
| `PersistSignalAdapter` | Active signal state | Signal opens (not scheduled) | `ISignalRow` with prices, position, timestamps |
| `PersistRiskAdapter` | Portfolio-wide risk tracking | Risk limits updated | Active signal counts, exposure totals |
| `PersistScheduleAdapter` | Schedule metadata | Scheduled signals created | Pending order details (ephemeral) |
| `PersistPartialAdapter` | Profit/loss milestones | Partial levels hit | 10%, 20%, 30%+ profit/loss events |


---

## PersistBase Interface

All persistence adapters implement the `PersistBase` interface, which defines the contract for crash-safe storage:

![Mermaid Diagram](./diagrams\50_crash-recovery-persistence_1.svg)


### Method Contracts

**`waitForInit(): Promise<void>`**
- Called once during adapter initialization
- Must complete before any read/write operations
- Use for connection establishment, file system setup, or authentication
- Example: Redis client connection, file directory creation

**`readValue(key: string): Promise<T>`**
- Retrieves persisted value for the given key
- Throws error if key doesn't exist
- Must return typed data (deserialization handled by implementation)

**`hasValue(key: string): Promise<boolean>`**
- Checks if persisted data exists for the key
- Returns `true` if data exists, `false` otherwise
- Used before `readValue()` to avoid errors

**`writeValue(key: string, value: T): Promise<void>`**
- **Atomic operation**: Saves value to storage
- Must be crash-safe (use temp files + rename for file systems)
- Should be idempotent (multiple writes produce same result)

**`deleteValue(key: string): Promise<void>`**
- Removes persisted data for the key
- Called when signals close
- Must be idempotent (safe to call on non-existent keys)


---

## Signal Persistence Lifecycle

Signals transition through multiple states, but only **opened** signals are persisted. This diagram shows when persistence operations occur:

![Mermaid Diagram](./diagrams\50_crash-recovery-persistence_2.svg)


### Key State Transitions

**Scheduled → Opened**: `writeValue()` called
- Signal transitions from limit order to active position
- `ClientStrategy.setPendingSignal()` triggers `PersistSignalAdapter.writeSignalData()`
- Data written: `{ id, position, priceOpen, priceTakeProfit, priceStopLoss, minuteEstimatedTime, timestamp, symbol, exchangeName, strategyName }`

**Active → Closed**: `deleteValue()` called
- Position closes via TP, SL, or time expiration
- `ClientStrategy` detects close condition and triggers deletion
- Storage cleanup ensures no stale data remains

**Crash During Active**: System restart
- `Live.background()` starts
- `ClientStrategy.waitForInit()` calls `PersistSignalAdapter.readSignalData()`
- Signal state restored, monitoring continues from last known state


---

## Atomic Write Operations

Persistence operations must be **atomic** to prevent data corruption during crashes. The default file-based implementation uses a temp-file-and-rename pattern:

![Mermaid Diagram](./diagrams\50_crash-recovery-persistence_3.svg)


### Why Atomic Writes Matter

**Problem**: Direct file writes are not atomic
```
# Without atomicity - DANGEROUS
write_to_file("signal.json", new_data)  # Crash here = corrupted file
```

**Solution**: Temp-file-and-rename pattern
```
# With atomicity - SAFE
write_to_file("signal.tmp", new_data)   # Crash here = old data still exists
atomic_rename("signal.tmp", "signal.json")  # Atomic OS operation
```

The `rename()` system call is atomic on POSIX systems. Either the old file exists (before rename) or the new file exists (after rename). There's no intermediate state where the file is partially written.


---

## Recovery Flow

When a live trading bot restarts after a crash, the recovery process follows this sequence:

![Mermaid Diagram](./diagrams\50_crash-recovery-persistence_4.svg)


### Recovery Scenarios

**Scenario 1: Crash with active LONG signal**
```
Before crash:
- Signal opened at priceOpen=43000
- TP=44000, SL=42000
- Position active, monitoring

After restart:
- readSignalData() returns saved state
- Current price checked via VWAP
- If price=44500 → closes by TP immediately
- If price=43500 → continues monitoring
```

**Scenario 2: Crash during scheduled signal**
```
Before crash:
- Signal scheduled, waiting for priceOpen=42000
- Current price=43000 (above priceOpen)
- Not yet persisted (scheduled ≠ opened)

After restart:
- hasValue() returns false
- No restoration needed
- Signal lost (acceptable, was never opened)
- getSignal() will generate new signal on next tick
```

**Scenario 3: Multiple strategies per symbol**
```
Keys stored:
- BTCUSDT:strategy-1 → Long position
- BTCUSDT:strategy-2 → Short position
- ETHUSDT:strategy-1 → Long position

After restart:
- Each ClientStrategy instance reads its own key
- Positions restored independently
- No collision between strategies
```


---

## Default File-Based Storage

The framework includes a default file-based persistence implementation. It stores data as JSON files in the `./persist/` directory:

```
./persist/
├── signals/
│   ├── BTCUSDT:my-strategy.json
│   ├── ETHUSDT:my-strategy.json
│   └── BTCUSDT:another-strategy.json
├── risks/
│   ├── default-risk.json
│   └── aggressive-risk.json
├── schedules/
│   └── BTCUSDT:my-strategy.json
└── partials/
    └── BTCUSDT:my-strategy.json
```

### File Structure Example

**Signal persistence file** (`./persist/signals/BTCUSDT:my-strategy.json`):
```json
{
  "id": "signal-uuid-123",
  "position": "long",
  "priceOpen": 43000,
  "priceTakeProfit": 44000,
  "priceStopLoss": 42000,
  "minuteEstimatedTime": 60,
  "timestamp": 1704067200000,
  "symbol": "BTCUSDT",
  "exchangeName": "binance",
  "strategyName": "my-strategy",
  "note": "Optional signal note"
}
```

**Risk persistence file** (`./persist/risks/default-risk.json`):
```json
{
  "activeSignals": {
    "BTCUSDT:my-strategy": 1,
    "ETHUSDT:my-strategy": 1
  },
  "totalExposure": 2,
  "lastUpdate": 1704067200000
}
```


---

## Testing Persistence

The test suite includes comprehensive persistence recovery scenarios. Tests verify that signals correctly restore after simulated crashes:

![Mermaid Diagram](./diagrams\50_crash-recovery-persistence_5.svg)


### Example Test: LONG Signal TP After Restart

This test verifies that a LONG signal correctly closes by TP after the system restarts:

```typescript
// From test/e2e/persist.test.mjs:25-94

// 1. Mock PersistSignalAdapter to return saved signal
PersistSignalAdapter.usePersistSignalAdapter(class {
  async readValue() {
    return {
      id: "persist-long-tp",
      position: "long",
      priceOpen: 43000,
      priceTakeProfit: 44000,  // Current price will be at TP level
      priceStopLoss: 42000,
      // ... other fields
    };
  }
  async hasValue() { return true; }  // Signal exists in storage
});

// 2. Configure exchange to return candles at TP level
addExchange({
  getCandles: async () => [{
    open: 44000,   // Price at TP level
    high: 44100,
    low: 43900,
    close: 44000,
    // ...
  }]
});

// 3. Register strategy with onClose callback
let onCloseCalled = false;
addStrategy({
  getSignal: async () => null,  // No new signals
  callbacks: {
    onClose: () => { onCloseCalled = true; }
  }
});

// 4. Start live trading (will restore signal)
Live.background("BTCUSDT", { strategyName, exchangeName });

// 5. Verify signal closed by TP after restart
// onCloseCalled === true
// closeReason === "take_profit"
```


### Test Coverage Matrix

| Test | Scenario | Verifies |
|------|----------|----------|
| PERSIST #1 | LONG TP after restart | Signal restores, closes by TP, callback fires |
| PERSIST #2 | LONG SL after restart | Signal restores, closes by SL, negative PNL |
| PERSIST #3 | SHORT TP after restart | Short position logic, closes by TP |
| PERSIST #4 | SHORT SL after restart | Short position logic, closes by SL |
| PERSIST #5 | Time expired after restart | Signal restores, closes by time expiration |
| PERSIST #6 | No persisted data | hasValue()=false, starts fresh |


---

## Disabling Persistence in Tests

For unit tests and backtests, persistence is typically disabled to avoid file system I/O and improve test speed. The test setup provides mock adapters that implement `PersistBase` but don't actually write to disk:

```typescript
// From test/config/setup.mjs:13-30

PersistSignalAdapter.usePersistSignalAdapter(class {
  async waitForInit() { /* no-op */ }
  
  async readValue() {
    throw new Error("Should not be called in testbed");
  }
  
  async hasValue() {
    return false;  // Always return false in tests
  }
  
  async writeValue() { /* no-op */ }
  async deleteValue() { /* no-op */ }
});
```

This approach ensures:
- Tests run in-memory without disk I/O
- No cleanup required after test runs
- Faster test execution
- No file system side effects


---

## Integration Points

The persistence system integrates with multiple framework components:

![Mermaid Diagram](./diagrams\50_crash-recovery-persistence_6.svg)


### ClientStrategy Integration

**`ClientStrategy.waitForInit()`** - `docs/internals.md:76`
- Called once per strategy instance before any tick operations
- Triggers `PersistSignalAdapter.waitForInit()` and `hasValue()` check
- If persisted data exists, calls `readSignalData()` to restore state

**`ClientStrategy.setPendingSignal()`** - `docs/internals.md:77`
- Called when signal transitions from scheduled to opened
- Triggers `PersistSignalAdapter.writeSignalData()`
- Atomic write ensures crash safety

**`ClientStrategy.tick()`** - `docs/internals.md:62-67`
- Monitors active signals for TP/SL/time conditions
- When signal closes, triggers `PersistSignalAdapter.deleteSignalData()`
- Cleanup ensures no stale data remains


---

## Configuration Options

Persistence behavior can be configured globally via `GLOBAL_CONFIG`:

```typescript
// From src/config/params.ts:1-122

setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 120,  // Scheduled signal timeout
  CC_AVG_PRICE_CANDLES_COUNT: 5,   // VWAP calculation window
  // ... other config options
});
```

**Key Configuration Parameters**:

| Parameter | Default | Impact on Persistence |
|-----------|---------|----------------------|
| `CC_SCHEDULE_AWAIT_MINUTES` | 120 | Max time scheduled signals wait before cancellation (not persisted) |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 | Max lifetime for persisted signals (auto-close after 1 day) |
| `CC_PERCENT_FEE` | 0.1 | Fee applied to PNL calculations (persisted in closed signal data) |
| `CC_PERCENT_SLIPPAGE` | 0.1 | Slippage applied to PNL (persisted in closed signal data) |


---

## Best Practices

**1. Always use atomic writes for custom backends**
```typescript
// ✅ GOOD: Atomic writes with temp files
async writeValue(key, value) {
  const tmpPath = `${key}.tmp`;
  const finalPath = `${key}.json`;
  await fs.writeFile(tmpPath, JSON.stringify(value));
  await fs.rename(tmpPath, finalPath);  // Atomic on POSIX
}

// ❌ BAD: Direct writes (not crash-safe)
async writeValue(key, value) {
  await fs.writeFile(`${key}.json`, JSON.stringify(value));
  // Crash during write = corrupted file
}
```

**2. Implement proper error handling in readValue()**
```typescript
// ✅ GOOD: Clear error messages
async readValue(key) {
  if (!await this.hasValue(key)) {
    throw new Error(`No persisted data found for key: ${key}`);
  }
  const data = await fs.readFile(`${key}.json`, 'utf-8');
  return JSON.parse(data);
}

// ❌ BAD: Generic errors
async readValue(key) {
  return JSON.parse(await fs.readFile(`${key}.json`));
  // Crash with unhelpful "ENOENT" error
}
```

**3. Make deleteValue() idempotent**
```typescript
// ✅ GOOD: Safe to call multiple times
async deleteValue(key) {
  try {
    await fs.unlink(`${key}.json`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // Ignore "file not found" errors
  }
}

// ❌ BAD: Crashes on missing file
async deleteValue(key) {
  await fs.unlink(`${key}.json`);
  // Crash if file already deleted
}
```

**4. Validate restored data**
```typescript
// ✅ GOOD: Schema validation after restore
async readValue(key) {
  const data = await this.storage.get(key);
  
  // Validate required fields
  if (!data.position || !data.priceOpen || !data.priceTakeProfit) {
    throw new Error(`Invalid signal data in storage: ${key}`);
  }
  
  // Validate data types
  if (typeof data.priceOpen !== 'number') {
    throw new Error(`Invalid priceOpen type: ${typeof data.priceOpen}`);
  }
  
  return data;
}

// ❌ BAD: Blindly trust storage
async readValue(key) {
  return await this.storage.get(key);
  // Corrupted data crashes the system
}
```

**5. Test recovery scenarios**
```typescript
// ✅ GOOD: Test all close conditions after restart
test("PERSIST: Signal closes by TP after restart", async () => { /* ... */ });
test("PERSIST: Signal closes by SL after restart", async () => { /* ... */ });
test("PERSIST: Signal closes by time after restart", async () => { /* ... */ });
```


---

## Limitations and Considerations

**1. Scheduled signals are not persisted**
- Limit orders waiting for activation are ephemeral
- Lost on crash/restart (acceptable trade-off)
- Prevents data bloat for signals that never opened
- `getSignal()` will generate new signals after restart

**2. File-based storage is not distributed**
- Default implementation uses local file system
- Cannot share state across multiple processes/servers
- For distributed systems, implement Redis or database backend

**3. Storage keys must be unique**
- Key format: `${symbol}:${strategyName}`
- Multiple strategies on same symbol use different keys
- Collision prevention is critical

**4. No transaction support**
- Each adapter operates independently
- No atomic multi-adapter writes
- Consider distributed transactions for custom backends

**5. Performance considerations**
- File I/O on every signal open/close
- For high-frequency strategies, consider in-memory caching
- Redis backend recommended for < 1ms persistence latency


---

## Summary

The persistence system provides **crash-safe state storage** for live trading through:

- **Atomic write operations** prevent data corruption
- **Selective persistence** (opened signals only) prevents bloat
- **Pluggable backends** enable Redis, MongoDB, or custom storage
- **Automatic recovery** restores signals on restart
- **Clean cleanup** deletes closed signals automatically

Key integration points:
- `ClientStrategy.waitForInit()` - Initialization and restoration
- `ClientStrategy.setPendingSignal()` - Write on signal open
- `ClientStrategy.tick()` - Delete on signal close

For custom backend implementation, see [Custom Persistence Backends](./46_advanced-features.md).
