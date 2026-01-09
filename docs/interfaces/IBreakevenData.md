---
title: docs/interface/IBreakevenData
group: docs
---

# IBreakevenData

Serializable breakeven data for persistence layer.
Converts state to simple boolean for JSON serialization.

Stored in PersistBreakevenAdapter as Record&lt;signalId, IBreakevenData&gt;.
Loaded on initialization and converted back to IBreakevenState.

## Properties

### reached

```ts
reached: boolean
```

Whether breakeven has been reached for this signal.
Serialized form of IBreakevenState.reached.
