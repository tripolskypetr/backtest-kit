---
title: docs/class/MarkdownFolderBase
group: docs
---

# MarkdownFolderBase

Implements `TMarkdownBase`

Folder-based markdown adapter with separate files per report.

Features:
- Writes each markdown report as a separate .md file
- File path based on options.path and options.file
- Automatic directory creation
- No stream management (direct writeFile)
- Suitable for human-readable report directories

File format: {options.path}/{options.file}
Example: ./dump/backtest/BTCUSDT_my-strategy_binance_2024-Q1_backtest-1736601234567.md

Use this adapter (default) for organized report directories and manual review.

## Constructor

```ts
constructor(markdownName: keyof IMarkdownTarget);
```

## Properties

### markdownName

```ts
markdownName: keyof IMarkdownTarget
```

## Methods

### waitForInit

```ts
waitForInit(): Promise<void>;
```

No-op initialization for folder adapter.
This adapter doesn't need initialization since it uses direct writeFile.

### dump

```ts
dump(content: string, options: IMarkdownDumpOptions): Promise<void>;
```

Writes markdown content to a separate file.
Creates directory structure automatically.
File path is determined by options.path and options.file.
