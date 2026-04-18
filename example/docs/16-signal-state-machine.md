---
title: begin/16_signal_state_machine
group: begin
---

# Signal State Machine

The Signal State Machine is the core execution logic of the `backtest-kit` framework. It governs the lifecycle of a trading instruction from its initial generation by a strategy to its final settlement. The state machine ensures logical consistency, prevents overlapping trades for the same symbol-strategy pair, and handles precise PNL calculations including slippage and exchange fees.

## Signal Lifecycle & Transitions

A signal progresses through six distinct states. Transitions are strictly controlled to maintain the integrity of the trading simulation and live execution.

### State Transition Diagram
The following diagram illustrates the flow between states and the triggers for each transition.

Title: Signal State Transitions
![Mermaid Diagram](./diagrams/16-signal-state-machine_0.svg)

## State Definitions

### 1. Idle
The baseline state where no active signal exists for a specific symbol-strategy pair. The framework calls the strategy's `getSignal()` function during this state.

### 2. Scheduled
A pending state where a signal waits for the market price to reach a specific `priceOpen` (limit order behavior).
*   **LONG**: Activates when `currentPrice <= priceOpen`.
*   **SHORT**: Activates when `currentPrice >= priceOpen`.
*   **Expiry**: If not reached within `CC_SCHEDULE_AWAIT_MINUTES` (default 60), it transitions to `CANCELLED`.

### 3. Opened
An intermediate state triggered the moment entry conditions are met. It serves as a hook for logging and notifications before the position becomes "Active" for monitoring.

### 4. Active
The position is live and being monitored for exit conditions every tick.
*   **Take-Profit (TP)**: `currentPrice >= priceTakeProfit` (Long) or `<= priceTakeProfit` (Short).
*   **Stop-Loss (SL)**: `currentPrice <= priceStopLoss` (Long) or `>= priceStopLoss` (Short).
*   **Time Expiry**: Triggered if `currentTime - pendingAt > minuteEstimatedTime`.

### 5. Closed
A terminal state reached after an exit condition is met. The framework calculates the final PNL at this stage.

### 6. Cancelled
A terminal state for `SCHEDULED` signals that failed to trigger because the price hit the Stop-Loss first or the entry timeout expired.


## PNL Calculation with Slippage and Fees

The state machine calculates PNL by adjusting raw entry and exit prices to account for market impact (slippage) and exchange commissions.

| Parameter | Default Value | Description |
| :--- | :--- | :--- |
| `CC_PERCENT_SLIPPAGE` | 0.1% | Market impact for entry/exit |
| `CC_PERCENT_FEE` | 0.1% | Exchange trading commission |

**Calculation Logic (Long Position):**
1.  **Adjusted Entry**: `priceOpen * (1 + slippage) * (1 + fee)`
2.  **Adjusted Exit**: `priceClose * (1 - slippage) * (1 - fee)`
3.  **Final PNL %**: `((Adjusted Exit - Adjusted Entry) / Adjusted Entry) * 100`


## Validation Engine

Before a signal can transition from `IDLE` to `SCHEDULED` or `OPENED`, it must pass a multi-stage validation engine to ensure logical consistency and risk compliance.

### Logical Consistency & Economic Viability
The system validates that the signal parameters make sense relative to the current market price.

Title: Signal Validation Logic (Code Entity Space)
![Mermaid Diagram](./diagrams/16-signal-state-machine_1.svg)

**Validation Rules:**
*   **Logical Consistency**: For a LONG, `priceTakeProfit` must be > `priceOpen`, and `priceStopLoss` must be < `priceOpen`.
*   **Economic Viability**: The distance between `priceOpen` and `priceTakeProfit` must be greater than the total trading costs (~0.4%) to ensure the trade can actually result in a net profit.
*   **Risk Mitigation**: Checks against `maxConcurrentPositions` and symbol-specific blacklists via the `addRisk()` registry.


## Time Expiry Mechanism (`minuteEstimatedTime`)

The `minuteEstimatedTime` parameter acts as a "time-based stop-loss." It prevents capital from being locked in stagnant trades.

*   **Mechanism**: When a signal transitions to `OPENED`, a `pendingAt` timestamp is recorded.
*   **Calculation**: In every `ACTIVE` tick, the engine checks:
    `isExpired = (currentTimestamp - pendingAt) > (minuteEstimatedTime * 60 * 1000)`
*   **Result**: If `true`, the position is closed with the reason `"time_expired"`, and the PNL is settled at the current market price.
