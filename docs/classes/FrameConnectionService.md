---
title: docs/api-reference/class/FrameConnectionService
group: docs
---

# FrameConnectionService

Implements `IFrame`

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### frameSchemaService

```ts
frameSchemaService: any
```

### methodContextService

```ts
methodContextService: any
```

### getFrame

```ts
getFrame: ((frameName: string) => ClientFrame) & IClearableMemoize<string> & IControlMemoize<string, ClientFrame>
```

### getTimeframe

```ts
getTimeframe: (symbol: string) => Promise<Date[]>
```
