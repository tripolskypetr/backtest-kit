---
title: docs/function/overrideRisk
group: docs
---

# overrideRisk

```ts
declare function overrideRisk(riskSchema: TRiskSchema): Promise<IRiskSchema>;
```

Overrides an existing risk management configuration in the framework.

This function partially updates a previously registered risk configuration with new settings.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `riskSchema` | Partial risk configuration object |
