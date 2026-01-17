---
title: docs/function/addOptimizerSchema
group: docs
---

# addOptimizerSchema

```ts
declare function addOptimizerSchema(optimizerSchema: IOptimizerSchema): void;
```

Registers an optimizer configuration in the framework.

The optimizer generates trading strategies by:
- Collecting data from multiple sources across training periods
- Building LLM conversation history with fetched data
- Generating strategy prompts using getPrompt()
- Creating executable backtest code with templates

The optimizer produces a complete .mjs file containing:
- Exchange, Frame, Strategy, and Walker configurations
- Multi-timeframe analysis logic
- LLM integration for signal generation
- Event listeners for progress tracking

## Parameters

| Parameter | Description |
|-----------|-------------|
| `optimizerSchema` | Optimizer configuration object |
