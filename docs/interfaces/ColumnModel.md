---
title: docs/api-reference/interface/ColumnModel
group: docs
---

# ColumnModel

Column configuration for markdown table generation.
Generic interface that defines how to extract and format data from any data type.

## Properties

### key

```ts
key: string
```

Unique column identifier

### label

```ts
label: string
```

Display label for column header

### format

```ts
format: (data: T, index: number) => string | Promise<string>
```

Formatting function to convert data to string

### isVisible

```ts
isVisible: () => boolean | Promise<boolean>
```

Function to determine if column should be visible
