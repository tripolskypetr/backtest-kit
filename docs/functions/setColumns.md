---
title: docs/api-reference/function/setColumns
group: docs
---

# setColumns

```ts
declare function setColumns(columns: Partial<ColumnConfig>, _unsafe?: boolean): void;
```

Sets custom column configurations for markdown report generation.

Allows overriding default column definitions for any report type.
All columns are validated before assignment to ensure structural correctness.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `columns` | Partial column configuration object to override default column settings |
| `_unsafe` | Skip column validations - required for testbed |
