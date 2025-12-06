---
title: docs/api-reference/class/OutlineMarkdownService
group: docs
---

# OutlineMarkdownService

Service for generating markdown documentation from LLM outline results.
Used by AI Strategy Optimizer to save debug logs and conversation history.

Creates directory structure:
- ./dump/strategy/{signalId}/00_system_prompt.md - System messages and output data
- ./dump/strategy/{signalId}/01_user_message.md - First user input
- ./dump/strategy/{signalId}/02_user_message.md - Second user input
- ./dump/strategy/{signalId}/XX_llm_output.md - Final LLM output

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

Logger service injected via DI

### dumpSignal

```ts
dumpSignal: (signalId: ResultId, history: MessageModel[], signal: ISignalDto, outputDir?: string) => Promise<void>
```

Dumps signal data and conversation history to markdown files.
Skips if directory already exists to avoid overwriting previous results.

Generated files:
- 00_system_prompt.md - System messages and output summary
- XX_user_message.md - Each user message in separate file (numbered)
- XX_llm_output.md - Final LLM output with signal data
