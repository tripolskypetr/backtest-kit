---
title: docs/function/dumpSignalData
group: docs
---

# dumpSignalData

```ts
declare function dumpSignalData(signalId: string | number, history: MessageModel[], signal: ISignalDto, outputDir?: string): Promise<void>;
```

Dumps signal data and LLM conversation history to markdown files.
Used by AI-powered strategies to save debug logs for analysis.

Creates a directory structure with:
- 00_system_prompt.md - System messages and output summary
- XX_user_message.md - Each user message in separate file (numbered)
- XX_llm_output.md - Final LLM output with signal data

Skips if directory already exists to avoid overwriting previous results.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `signalId` | Unique identifier for the result (used as directory name, e.g., UUID) |
| `history` | Array of message models from LLM conversation |
| `signal` | Signal DTO returned by LLM (position, priceOpen, TP, SL, etc.) |
| `outputDir` | Output directory path (default: "./dump/strategy") |
