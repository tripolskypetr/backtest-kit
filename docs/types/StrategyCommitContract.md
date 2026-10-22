---
title: docs/type/StrategyCommitContract
group: docs
---

# StrategyCommitContract

```ts
type StrategyCommitContract = CancelScheduledCommit | ClosePendingCommit | PartialProfitCommit | PartialLossCommit | TrailingStopCommit | TrailingTakeCommit | BreakevenCommit | AverageBuyCommit | DividendCommit | ActivateScheduledCommit;
```

Discriminated union for strategy management signal events.

Emitted by strategyCommitSubject when strategy management actions are executed.

Consumers:
- StrategyReportService: Persists events to JSON files
- StrategyMarkdownService: Accumulates events for markdown reports

Note: Signal data (IPublicSignalRow) is NOT included in this contract.
Consumers must retrieve signal data from StrategyCoreService using
getPendingSignal() or getScheduledSignal() methods.
