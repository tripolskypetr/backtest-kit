---
title: docs/function/addRiskSchema
group: docs
---

# addRiskSchema

```ts
declare function addRiskSchema(riskSchema: IRiskSchema): void;
```

Registers a risk management configuration in the framework.

The risk configuration defines:
- Maximum concurrent positions across all strategies
- Custom validations for advanced risk logic (portfolio metrics, correlations, etc.)
- Callbacks for rejected/allowed signals

Multiple ClientStrategy instances share the same ClientRisk instance,
enabling cross-strategy risk analysis. ClientRisk tracks all active positions
and provides access to them via validation functions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `riskSchema` | Risk configuration object |
