---
title: design/45_markdown_services
group: design
---

# Markdown Services

## Purpose and Scope

This document describes the Markdown Services subsystem, which provides automated report generation and performance analytics for backtesting and live trading operations. These services subscribe to execution events, accumulate statistical data, and generate markdown-formatted reports with comprehensive trading metrics.

For information about the event system that feeds these services, see [Event System](./13_Event_System.md). For details on the execution modes that generate events, see [Execution Modes](./06_Execution_Modes.md).

---

## Service Architecture

The Markdown Services subsystem consists of three specialized service classes, each responsible for reporting on a specific execution mode:

![Mermaid Diagram](./diagrams/45_Markdown_Services_0.svg)


| Service | Event Source | Data Stored | Primary Purpose |
|---------|-------------|-------------|-----------------|
| `BacktestMarkdownService` | `signalBacktestEmitter` | Closed signals only | Historical backtest performance analysis |
| `LiveMarkdownService` | `signalLiveEmitter` | All events (idle, opened, active, closed) | Real-time trading activity monitoring |
| `ScheduleMarkdownService` | `signalEmitter`, `signalLiveEmitter` | Scheduled and cancelled signals | Limit order execution tracking |


---

## Data Flow Architecture

The following diagram illustrates how trading events flow from execution contexts through emitters to markdown services, and finally to persistent reports:

![Mermaid Diagram](./diagrams/45_Markdown_Services_1.svg)


---

## BacktestMarkdownService

### Purpose

`BacktestMarkdownService` generates performance reports for historical backtesting by accumulating closed signals and calculating trading statistics. It only processes `closed` action events, ignoring intermediate states.


### Event Subscription

The service subscribes to `signalBacktestEmitter` during initialization using the `singleshot` pattern to ensure one-time setup:

![Mermaid Diagram](./diagrams/45_Markdown_Services_2.svg)


### Internal Storage Structure

Each strategy gets an isolated `ReportStorage` instance via memoization:

![Mermaid Diagram](./diagrams/45_Markdown_Services_3.svg)


### Statistics Interface

```typescript
interface BacktestStatistics {
  signalList: IStrategyTickResultClosed[];
  totalSignals: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;          // 0-100%, null if unsafe
  avgPnl: number | null;            // Average PNL %
  totalPnl: number | null;          // Cumulative PNL %
  stdDev: number | null;            // Volatility
  sharpeRatio: number | null;       // avgPnl / stdDev
  annualizedSharpeRatio: number | null;  // sharpeRatio × √365
  certaintyRatio: number | null;    // avgWin / |avgLoss|
  expectedYearlyReturns: number | null;  // Projected annual return
}
```


### Safe Math Pattern

All numeric metrics use the `isUnsafe()` function to guard against `NaN`, `Infinity`, and invalid calculations:


---

## LiveMarkdownService

### Purpose

`LiveMarkdownService` tracks real-time trading activity by accumulating all tick events (idle, opened, active, closed) and provides comprehensive live trading analytics.


### Event Types Tracked

| Event Type | Stored As | Update Strategy |
|-----------|-----------|-----------------|
| `idle` | `TickEvent` | Replaces last idle if no open/active signals follow |
| `opened` | `TickEvent` | Appends to event list |
| `active` | `TickEvent` | Replaces existing event with same `signalId` |
| `closed` | `TickEvent` | Replaces existing event with same `signalId` |


### Event Accumulation Logic

![Mermaid Diagram](./diagrams/45_Markdown_Services_4.svg)


### MAX_EVENTS Limit

The service maintains a bounded queue of 250 events to prevent memory leaks in long-running live trading sessions:


---

## ScheduleMarkdownService

### Purpose

`ScheduleMarkdownService` tracks scheduled limit orders and their lifecycle outcomes (activated vs. cancelled), providing cancellation rate analytics.


### Event Subscription Strategy

Unlike the other services, `ScheduleMarkdownService` subscribes to both `signalLiveEmitter` and the global `signalEmitter` to capture scheduled signals from live trading:


### Statistics Interface

```typescript
interface ScheduleStatistics {
  eventList: ScheduledEvent[];
  totalEvents: number;
  totalScheduled: number;
  totalCancelled: number;
  cancellationRate: number | null;  // 0-100%, null if no scheduled
  avgWaitTime: number | null;       // Minutes, null if no cancelled
}
```


### Cancellation Rate Calculation

The cancellation rate metric indicates what percentage of scheduled limit orders were cancelled without execution:

```
cancellationRate = (totalCancelled / totalScheduled) × 100
```


---

## ReportStorage Pattern

### Architecture

Each markdown service contains an internal `ReportStorage` class that implements the Controller-View pattern for data management:

![Mermaid Diagram](./diagrams/45_Markdown_Services_5.svg)


### Memoization Pattern

Services use `functools-kit` memoization to create one `ReportStorage` instance per strategy:


---

## Statistics Calculation Pipeline

### Calculation Flow

![Mermaid Diagram](./diagrams/45_Markdown_Services_6.svg)


### Metric Definitions

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| Win Rate | `(winCount / totalSignals) × 100` | Percentage of profitable trades |
| Sharpe Ratio | `avgPnl / stdDev` | Risk-adjusted return (higher is better) |
| Annualized Sharpe | `sharpeRatio × √365` | Annual risk-adjusted return |
| Certainty Ratio | `avgWin / |avgLoss|` | Average win vs. average loss ratio |
| Expected Yearly Returns | `avgPnl × (365 / avgDurationDays)` | Projected annual profit % |


---

## Report Generation

### Markdown Table Structure

All services generate markdown reports with column-based tables for event data:

![Mermaid Diagram](./diagrams/45_Markdown_Services_7.svg)


### Column Configuration

Columns are defined as arrays of objects with `key`, `label`, and `format` properties:


### File Output

The `dump()` method writes reports to disk with the following structure:

```
./logs/
  backtest/
    {strategyName}.md
  live/
    {strategyName}.md
  schedule/
    {strategyName}.md
```


---

## Integration with Public API

### Class Delegation Pattern

Public API classes (`Backtest`, `Live`, `Schedule`) delegate to markdown services through the dependency injection container:

![Mermaid Diagram](./diagrams/45_Markdown_Services_8.svg)


### Method Mapping

| Public Method | Service Method | Return Type |
|--------------|----------------|-------------|
| `Backtest.getData(strategyName)` | `backtestMarkdownService.getData(strategyName)` | `BacktestStatistics` |
| `Backtest.getReport(strategyName)` | `backtestMarkdownService.getReport(strategyName)` | `string` |
| `Backtest.dump(strategyName, path?)` | `backtestMarkdownService.dump(strategyName, path)` | `void` |
| `Live.getData(strategyName)` | `liveMarkdownService.getData(strategyName)` | `LiveStatistics` |
| `Live.getReport(strategyName)` | `liveMarkdownService.getReport(strategyName)` | `string` |
| `Live.dump(strategyName, path?)` | `liveMarkdownService.dump(strategyName, path)` | `void` |
| `Schedule.getData(strategyName)` | `scheduleMarkdownService.getData(strategyName)` | `ScheduleStatistics` |
| `Schedule.getReport(strategyName)` | `scheduleMarkdownService.getReport(strategyName)` | `string` |
| `Schedule.dump(strategyName, path?)` | `scheduleMarkdownService.dump(strategyName, path)` | `void` |


---

## Service Lifecycle

### Initialization Sequence

![Mermaid Diagram](./diagrams/45_Markdown_Services_9.svg)


---

## Clear Operation

All markdown services implement a `clear()` method to reset accumulated data:

![Mermaid Diagram](./diagrams/45_Markdown_Services_10.svg)
