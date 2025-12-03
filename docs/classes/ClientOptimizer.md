---
title: docs/api-reference/class/ClientOptimizer
group: docs
---

# ClientOptimizer

Implements `IOptimizer`

Client implementation for optimizer operations.

Features:
- Data collection from multiple sources with pagination
- LLM conversation history building
- Strategy code generation with templates
- File export with callbacks

Used by OptimizerConnectionService to create optimizer instances.

## Constructor

```ts
constructor(params: IOptimizerParams, onProgress: (progress: ProgressOptimizerContract) => void);
```

## Properties

### params

```ts
params: IOptimizerParams
```

### onProgress

```ts
onProgress: (progress: ProgressOptimizerContract) => void
```

### getData

```ts
getData: (symbol: string) => Promise<IOptimizerStrategy[]>
```

Fetches data from all sources and generates strategy metadata.
Processes each training range and builds LLM conversation history.

### getCode

```ts
getCode: (symbol: string) => Promise<string>
```

Generates complete executable strategy code.
Includes imports, helpers, strategies, walker, and launcher.

### dump

```ts
dump: (symbol: string, path?: string) => Promise<void>
```

Generates and saves strategy code to file.
Creates directory if needed, writes .mjs file.
