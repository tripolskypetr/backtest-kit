---
title: design/28_strategy-callbacks
group: design
---

# Strategy Callbacks

This page documents the `IStrategyCallbacks` interface and its lifecycle hooks for monitoring and responding to signal state changes. Strategy callbacks provide optional event handlers that execute synchronously during strategy execution, enabling custom logging, notifications, and state management. For information about the broader signal lifecycle and state machine, see [Signals & Signal Lifecycle](./08_core-concepts.md). For details on the asynchronous event system that complements callbacks, see [Event Listeners](./40_reporting-monitoring.md).

---

## Overview

The `IStrategyCallbacks` interface defines 10 optional lifecycle hooks that fire during signal state transitions. Callbacks are registered via the `callbacks` field in `IStrategySchema` when calling `addStrategy()`. Unlike the global event emitter system, callbacks are strategy-specific and execute inline during signal processing.

**Key Characteristics:**
- Optional—all callbacks default to no-op if not provided
- Synchronous execution within the strategy tick cycle
- Scoped to the specific strategy instance
- Receives both backtest and live mode events


---

## IStrategyCallbacks Interface Structure

![Mermaid Diagram](./diagrams\28_strategy-callbacks_0.svg)


---

## Callback Lifecycle Hooks

### onTick

Called on every tick with the complete tick result, regardless of signal state. This is the most frequently invoked callback and executes before any other callbacks in the same tick.

**Signature:**
```typescript
onTick: (symbol: string, result: IStrategyTickResult, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair (e.g., "BTCUSDT") |
| `result` | `IStrategyTickResult` | Discriminated union of tick results |
| `backtest` | `boolean` | `true` for backtest mode, `false` for live |

**Use Cases:**
- Comprehensive tick-by-tick logging
- Custom metrics collection
- Real-time monitoring dashboards

**Invocation Points:**
- `src/client/ClientStrategy.ts:599-606` - After scheduled signal timeout cancellation
- `src/client/ClientStrategy.ts:765-772` - After scheduled signal activation
- `src/client/ClientStrategy.ts:792-799` - During scheduled signal monitoring


---

### onOpen

Called immediately after a signal is validated, persisted, and becomes active. This hook fires **after** risk validation passes but **before** the signal enters active monitoring.

**Signature:**
```typescript
onOpen: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair |
| `data` | `ISignalRow` | Complete signal with generated ID |
| `currentPrice` | `number` | VWAP price at signal open |
| `backtest` | `boolean` | Execution mode flag |

**Use Cases:**
- Send trade entry notifications
- Log position opening to external systems
- Update portfolio tracking

**Invocation Points:**
- `src/client/ClientStrategy.ts:747-754` - After scheduled signal activation
- `src/client/ClientStrategy.ts:862-869` - After immediate signal creation


---

### onActive

Called during each tick while a signal is being monitored (TP/SL checks). This callback executes repeatedly until the signal closes.

**Signature:**
```typescript
onActive: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair |
| `data` | `ISignalRow` | Active signal being monitored |
| `currentPrice` | `number` | Current VWAP price |
| `backtest` | `boolean` | Execution mode flag |

**Use Cases:**
- Track unrealized PNL changes
- Monitor distance to TP/SL
- Update live dashboards with active position status

**Invocation Points:**
- `src/client/ClientStrategy.ts:512-522` - During crash recovery initialization
- `src/client/ClientStrategy.ts:906-916` - During active signal monitoring in tick()


---

### onIdle

Called when no active or scheduled signal exists for the strategy-symbol pair. This indicates the strategy is waiting to generate a new signal.

**Signature:**
```typescript
onIdle: (symbol: string, currentPrice: number, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair |
| `currentPrice` | `number` | Current VWAP price |
| `backtest` | `boolean` | Execution mode flag |

**Use Cases:**
- Log idle state for monitoring
- Track strategy inactivity periods
- Trigger alerts if idle too long

**Invocation Points:**
- `src/client/ClientStrategy.ts:924-936` - When no signal exists during tick()


---

### onClose

Called when a signal completes (take profit, stop loss, or time expiration). This is the final lifecycle hook for a successful signal.

**Signature:**
```typescript
onClose: (symbol: string, data: ISignalRow, priceClose: number, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair |
| `data` | `ISignalRow` | Closed signal with full history |
| `priceClose` | `number` | Final exit price (VWAP) |
| `backtest` | `boolean` | Execution mode flag |

**Use Cases:**
- Send trade exit notifications
- Calculate and log realized PNL
- Update external tracking systems

**Invocation Points:**
- `src/client/ClientStrategy.ts:988-998` - After signal closes via TP/SL/time


---

### onSchedule

Called when a scheduled signal (limit order) is created. This occurs when `getSignal` returns a signal with `priceOpen` specified and the current price has not yet reached the entry level.

**Signature:**
```typescript
onSchedule: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair |
| `data` | `IScheduledSignalRow` | Scheduled signal awaiting activation |
| `currentPrice` | `number` | Current VWAP price |
| `backtest` | `boolean` | Execution mode flag |

**Use Cases:**
- Log pending limit orders
- Track scheduled signal lifetime
- Monitor price distance to activation

**Invocation Points:**
- `src/client/ClientStrategy.ts:540-550` - During crash recovery for persisted scheduled signals
- `src/client/ClientStrategy.ts:827-837` - After scheduled signal creation


---

### onCancel

Called when a scheduled signal is cancelled without opening a position. Cancellation occurs when the signal times out or the stop loss is hit before activation.

**Signature:**
```typescript
onCancel: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair |
| `data` | `IScheduledSignalRow` | Cancelled scheduled signal |
| `currentPrice` | `number` | Current VWAP price |
| `backtest` | `boolean` | Execution mode flag |

**Use Cases:**
- Log failed limit orders
- Track cancellation reasons (timeout vs SL)
- Analyze scheduled signal success rate

**Invocation Points:**
- `src/client/ClientStrategy.ts:580-587` - After scheduled signal timeout
- Implicitly during scheduled signal SL breach (before activation)


---

### onWrite

Called whenever a signal is written to persistence storage. This is primarily used for testing and debugging persistence logic. In backtest mode, this callback is typically not invoked since signals are not persisted.

**Signature:**
```typescript
onWrite: (symbol: string, data: ISignalRow | null, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair |
| `data` | `ISignalRow \| null` | Signal being written, or `null` for deletion |
| `backtest` | `boolean` | Execution mode flag |

**Use Cases:**
- Test persistence adapter behavior
- Debug signal serialization issues
- Audit persistence operations

**Invocation Points:**
- `src/client/ClientStrategy.ts:1029-1053` - In `setPendingSignal` method
- `src/client/ClientStrategy.ts:1055-1079` - In `setScheduledSignal` method


---

### onPartialProfit

Called when a signal reaches a profit milestone (10%, 20%, 30%, etc.) without hitting take profit. This enables tracking of unrealized gains during position monitoring.

**Signature:**
```typescript
onPartialProfit: (symbol: string, data: ISignalRow, currentPrice: number, revenuePercent: number, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair |
| `data` | `ISignalRow` | Active signal in profit |
| `currentPrice` | `number` | Current VWAP price |
| `revenuePercent` | `number` | Current profit percentage (positive value) |
| `backtest` | `boolean` | Execution mode flag |

**Use Cases:**
- Send profit milestone notifications
- Track trailing profit behavior
- Analyze optimal exit timing

**Invocation Points:**
- Via `ClientPartial.profit()` method during signal monitoring
- Only emits when crossing 10%, 20%, 30%... thresholds (deduplication via Set)


---

### onPartialLoss

Called when a signal reaches a loss milestone (10%, 20%, 30%, etc.) without hitting stop loss. This enables tracking of unrealized losses during position monitoring.

**Signature:**
```typescript
onPartialLoss: (symbol: string, data: ISignalRow, currentPrice: number, lossPercent: number, backtest: boolean) => void
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair |
| `data` | `ISignalRow` | Active signal in loss |
| `currentPrice` | `number` | Current VWAP price |
| `lossPercent` | `number` | Current loss percentage (negative value) |
| `backtest` | `boolean` | Execution mode flag |

**Use Cases:**
- Send loss milestone alerts
- Monitor drawdown risk
- Trigger emergency exit logic

**Invocation Points:**
- Via `ClientPartial.loss()` method during signal monitoring
- Only emits when crossing -10%, -20%, -30%... thresholds (deduplication via Set)


---

## Callback Invocation Flow

The following diagram shows the execution order of callbacks during different signal lifecycle transitions:

![Mermaid Diagram](./diagrams\28_strategy-callbacks_1.svg)


---

## Callbacks vs Event Emitters

Backtest Kit provides two parallel mechanisms for observing strategy behavior: **callbacks** (synchronous, strategy-scoped) and **event emitters** (asynchronous, global).

**Comparison Table:**

| Feature | Callbacks (`IStrategyCallbacks`) | Event Emitters (`listenSignal*`) |
|---------|----------------------------------|----------------------------------|
| **Scope** | Per-strategy | Global (all strategies) |
| **Execution** | Synchronous | Asynchronous (queued) |
| **Registration** | Via `addStrategy({ callbacks })` | Via `listenSignal()` functions |
| **Filtering** | Strategy-specific by default | Manual filtering required |
| **Backtest Support** | Yes | Yes |
| **Live Support** | Yes | Yes |
| **Performance** | Inline (no queue overhead) | Queued (prevents concurrent execution) |

**When to Use Callbacks:**
- Strategy-specific logging or metrics
- Inline validation or decision-making
- Testing specific strategy behavior

**When to Use Event Emitters:**
- Cross-strategy monitoring
- External system integration (webhooks, databases)
- Decoupled application architecture

**Example: Hybrid Approach**
```typescript
addStrategy({
  strategyName: 'my-strategy',
  interval: '5m',
  getSignal: async (symbol, when) => { /* ... */ },
  callbacks: {
    // Strategy-specific inline logging
    onOpen: (symbol, data, price, backtest) => {
      console.log(`[${data.strategyName}] Opened at ${price}`);
    },
    onClose: (symbol, data, priceClose, backtest) => {
      console.log(`[${data.strategyName}] Closed at ${priceClose}`);
    }
  }
});

// Global cross-strategy monitoring
listenSignal((event) => {
  if (event.action === 'closed') {
    // Send to external monitoring service
    sendToDatadog({
      metric: 'signal.closed',
      strategy: event.strategyName,
      pnl: event.pnl.pnlPercentage
    });
  }
});
```


---

## Integration with StrategyConnectionService

The `StrategyConnectionService` acts as a router between the public API and individual `ClientStrategy` instances. Callbacks are passed through this routing layer and stored in the `ClientStrategy` instance.

![Mermaid Diagram](./diagrams\28_strategy-callbacks_2.svg)

**Key Implementation Details:**

1. **Storage:** Callbacks are stored in `IStrategyParams.callbacks` field `src/interfaces/Strategy.interface.ts:79-94`

2. **Invocation Pattern:** All callbacks use optional chaining to avoid errors if not provided:
   ```typescript
   if (self.params.callbacks?.onOpen) {
     self.params.callbacks.onOpen(symbol, data, currentPrice, backtest);
   }
   ```
   `src/client/ClientStrategy.ts:747-754`

3. **Context Propagation:** The `backtest` flag propagates from `ExecutionContextService` to callbacks, enabling mode-specific logic


---

## Common Usage Patterns

### Pattern 1: Trade Execution Logging

```typescript
addStrategy({
  strategyName: 'rsi-strategy',
  interval: '5m',
  getSignal: async (symbol, when) => { /* ... */ },
  callbacks: {
    onOpen: (symbol, data, price, backtest) => {
      const mode = backtest ? '[BACKTEST]' : '[LIVE]';
      console.log(`${mode} ${symbol} ${data.position} OPEN @ ${price}`);
      console.log(`  TP: ${data.priceTakeProfit}, SL: ${data.priceStopLoss}`);
    },
    onClose: (symbol, data, priceClose, backtest) => {
      const pnl = calculatePnl(data, priceClose);
      console.log(`${symbol} CLOSE @ ${priceClose} | PNL: ${pnl}%`);
    }
  }
});
```

### Pattern 2: Unrealized PNL Tracking

```typescript
const unrealizedPnL = new Map<string, number>();

addStrategy({
  strategyName: 'momentum-strategy',
  interval: '15m',
  getSignal: async (symbol, when) => { /* ... */ },
  callbacks: {
    onOpen: (symbol, data, price) => {
      unrealizedPnL.set(data.id, 0);
    },
    onPartialProfit: (symbol, data, price, revenuePercent) => {
      unrealizedPnL.set(data.id, revenuePercent);
      console.log(`Signal ${data.id}: Unrealized +${revenuePercent}%`);
    },
    onPartialLoss: (symbol, data, price, lossPercent) => {
      unrealizedPnL.set(data.id, lossPercent);
      console.log(`Signal ${data.id}: Unrealized ${lossPercent}%`);
    },
    onClose: (symbol, data, priceClose) => {
      unrealizedPnL.delete(data.id);
    }
  }
});
```

### Pattern 3: Scheduled Signal Monitoring

```typescript
const scheduledSignals = new Map<string, Date>();

addStrategy({
  strategyName: 'breakout-strategy',
  interval: '30m',
  getSignal: async (symbol, when) => { /* ... */ },
  callbacks: {
    onSchedule: (symbol, data, currentPrice) => {
      scheduledSignals.set(data.id, new Date(data.scheduledAt));
      console.log(`Scheduled ${data.position} @ ${data.priceOpen}`);
      console.log(`Current price: ${currentPrice}, waiting for entry...`);
    },
    onOpen: (symbol, data, price) => {
      const scheduledTime = scheduledSignals.get(data.id);
      const waitTime = Date.now() - scheduledTime.getTime();
      console.log(`Signal activated after ${waitTime}ms wait`);
      scheduledSignals.delete(data.id);
    },
    onCancel: (symbol, data, currentPrice) => {
      const scheduledTime = scheduledSignals.get(data.id);
      console.log(`Signal cancelled before activation`);
      scheduledSignals.delete(data.id);
    }
  }
});
```

### Pattern 4: Conditional Backtest vs Live Behavior

```typescript
addStrategy({
  strategyName: 'adaptive-strategy',
  interval: '5m',
  getSignal: async (symbol, when) => { /* ... */ },
  callbacks: {
    onOpen: (symbol, data, price, backtest) => {
      if (backtest) {
        // Backtest: just log
        console.log(`Backtest signal opened: ${data.id}`);
      } else {
        // Live: send webhook notification
        fetch('https://api.example.com/webhooks/signal-opened', {
          method: 'POST',
          body: JSON.stringify({ symbol, price, position: data.position })
        });
      }
    }
  }
});
```


---

## Thread Safety and Execution Order

Callbacks execute synchronously within the strategy tick cycle, ensuring deterministic ordering:

1. **Signal state change** (e.g., idle → opened)
2. **State-specific callback** (e.g., `onOpen`)
3. **Always execute `onTick`** with full result
4. **Return tick result** to caller

This ordering guarantee enables callbacks to safely modify external state before `onTick` executes. However, note that callbacks should not throw exceptions—uncaught errors will be caught by `trycatch` wrapper and logged via `errorEmitter`.

**Exception Handling:**
```typescript
// From ClientStrategy.ts GET_SIGNAL_FN wrapper
const GET_SIGNAL_FN = trycatch(
  async (self: ClientStrategy): Promise<ISignalRow | null> => {
    // ... signal generation logic
  },
  {
    defaultValue: null,
    fallback: (error) => {
      backtest.loggerService.warn("ClientStrategy exception thrown", {
        error: errorData(error),
        message: getErrorMessage(error)
      });
      errorEmitter.next(error);
    }
  }
);
```
`src/client/ClientStrategy.ts:332-476`


---

## Debugging and Testing Callbacks

### Using onWrite for Persistence Testing

The `onWrite` callback is specifically designed for testing persistence behavior:

```typescript
const writeLog: Array<{ symbol: string, data: ISignalRow | null }> = [];

addStrategy({
  strategyName: 'test-strategy',
  interval: '1m',
  getSignal: async (symbol, when) => { /* ... */ },
  callbacks: {
    onWrite: (symbol, data, backtest) => {
      writeLog.push({ symbol, data });
      if (data === null) {
        console.log(`Signal deleted from persistence: ${symbol}`);
      } else {
        console.log(`Signal written to persistence: ${data.id}`);
      }
    }
  }
});

// After test execution, inspect writeLog
console.log(`Total writes: ${writeLog.length}`);
console.log(`Deletes: ${writeLog.filter(w => w.data === null).length}`);
```

### onTick for Comprehensive State Logging

Since `onTick` executes on every tick regardless of state, it's ideal for comprehensive logging:

```typescript
addStrategy({
  strategyName: 'debug-strategy',
  interval: '1m',
  getSignal: async (symbol, when) => { /* ... */ },
  callbacks: {
    onTick: (symbol, result, backtest) => {
      console.log(`[${new Date().toISOString()}] ${symbol} ${result.action}`);
      
      if (result.action === 'active') {
        console.log(`  Progress: TP=${result.percentTp}%, SL=${result.percentSl}%`);
      }
      
      if (result.action === 'closed') {
        console.log(`  Reason: ${result.closeReason}, PNL: ${result.pnl.pnlPercentage}%`);
      }
    }
  }
});
```


---

## Performance Considerations

Callbacks execute inline during the tick cycle, so expensive operations can impact strategy performance:

**Best Practices:**
- Keep callbacks lightweight
- Delegate heavy operations to external queues
- Avoid synchronous I/O in callbacks
- Use `backtest` flag to skip expensive operations during backtests

**Performance-Conscious Example:**
```typescript
const notificationQueue: Array<any> = [];

addStrategy({
  strategyName: 'efficient-strategy',
  interval: '5m',
  getSignal: async (symbol, when) => { /* ... */ },
  callbacks: {
    onOpen: (symbol, data, price, backtest) => {
      // Fast: push to in-memory queue
      if (!backtest) {
        notificationQueue.push({ type: 'open', symbol, price });
      }
      // Slow operation deferred to background worker
      // setImmediate(() => sendToExternalAPI(data));
    }
  }
});

// Background worker processes queue
setInterval(() => {
  if (notificationQueue.length > 0) {
    const batch = notificationQueue.splice(0, 10);
    sendBatchNotifications(batch); // Async, non-blocking
  }
}, 1000);
```

