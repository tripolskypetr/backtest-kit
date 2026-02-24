---
title: docs/function/dumpMessages
group: docs
---

# dumpMessages

```ts
declare function dumpMessages<Data extends object = any>(resultId: ResultId, history: Message[], result: Data, outputDir?: string): Promise<void>;
```

Dumps chat history and result data to markdown files in a structured directory.

Creates a subfolder named after `resultId` inside `outputDir`.
If the subfolder already exists, the function returns early without overwriting.
Writes:
- `00_system_prompt.md` — system messages and output data summary
- `NN_user_message.md` — each user message as a separate file
- `NN_llm_output.md` — final LLM output data

Warns via logger if any user message exceeds 30 KB.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `resultId` | Unique identifier for the result (used as subfolder name) |
| `history` | Full chat history containing system, user, and assistant messages |
| `result` | Structured output data to include in the dump |
| `outputDir` | Base directory for output files (default: `./dump/strategy`) |
