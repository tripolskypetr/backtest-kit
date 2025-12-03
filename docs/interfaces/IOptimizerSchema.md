---
title: docs/api-reference/interface/IOptimizerSchema
group: docs
---

# IOptimizerSchema

Schema configuration for optimizer registration.
Defines how to collect data, generate strategies, and create executable code.

## Properties

### note

```ts
note: string
```

Optional description of this optimizer configuration.

### optimizerName

```ts
optimizerName: string
```

Unique identifier for this optimizer.
Used to retrieve optimizer instance from registry.

### rangeTrain

```ts
rangeTrain: IOptimizerRange[]
```

Array of training time ranges.
Each range generates a separate strategy variant for comparison.

### rangeTest

```ts
rangeTest: IOptimizerRange
```

Testing time range for strategy validation.
Used in generated Walker to evaluate strategy performance.

### source

```ts
source: Source<any>[]
```

Array of data sources for strategy generation.
Each source contributes to the LLM conversation context.

### getPrompt

```ts
getPrompt: (symbol: string, messages: MessageModel[]) => string | Promise<string>
```

Function to generate strategy prompt from conversation history.
Called after all sources are processed for each training range.

### template

```ts
template: Partial<IOptimizerTemplate>
```

Optional custom template overrides.
If not provided, uses defaults from OptimizerTemplateService.

### callbacks

```ts
callbacks: Partial<IOptimizerCallbacks>
```

Optional lifecycle callbacks for monitoring.
