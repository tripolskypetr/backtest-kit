---
title: docs/interface/ILauncherArgs
group: docs
---

# ILauncherArgs

Base registration arguments shared by every launcher run mode.

A launcher binds a symbol list to optional strategy and exchange
references; everything left out is resolved implicitly from the
registries at run time — a setup with one strategy and one exchange
needs nothing but the symbol list and a mode flag.

## Properties

### launcherName

```ts
launcherName: string
```

Unique launcher identifier for the schema registry

### symbolList

```ts
symbolList: string[]
```

Trading pair symbols (e.g., "BTCUSDT") the launcher starts an instance for

### strategyName

```ts
strategyName: string
```

Strategy to run. Optional: defaults to the single registered strategy; ambiguous (2+ registered) requires it

### exchangeName

```ts
exchangeName: string
```

Exchange to run on. Optional: defaults to the single registered exchange; ambiguous (2+ registered) requires it

### callbacks

```ts
callbacks: Partial<ILauncherCallbacks>
```

Lifecycle callbacks (all optional)
