---
title: docs/function/overrideAction
group: docs
---

# overrideAction

```ts
declare function overrideAction(actionSchema: TActionSchema): Promise<IActionSchema>;
```

Overrides an existing action handler configuration in the framework.

This function partially updates a previously registered action handler with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

Useful for:
- Updating event handler logic without re-registering
- Modifying callbacks for different environments (dev/prod)
- Switching handler implementations dynamically
- Adjusting action behavior without strategy changes

## Parameters

| Parameter | Description |
|-----------|-------------|
| `actionSchema` | Partial action configuration object |
