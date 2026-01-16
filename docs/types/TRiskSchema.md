---
title: docs/type/TRiskSchema
group: docs
---

# TRiskSchema

```ts
type TRiskSchema = {
    riskName: IRiskSchema["riskName"];
} & Partial<IRiskSchema>;
```

Partial risk schema for override operations.

Requires only the risk name identifier, all other fields are optional.
Used by overrideRisk() to perform partial updates without replacing entire configuration.
