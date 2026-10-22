---
title: docs/class/BudgetRejectedError
group: docs
---

# BudgetRejectedError

Extends `Error`

Business rejection of a `Budget` action: `reserve` asked for more than the
free balance, or `withdraw` asked for more units of an asset than the budget
holds, both at the logical time of the call.

The rejection is recorded in the budget journal as a `reject` row (visible in
`getHistory()` and the budget report) BEFORE the error is thrown, so a refused
action is never silent. The strategy decides what to do with it — typically
`return null` from `getSignal` (no trade this tick).

Nominal runtime identification: the framework and user code recognize the
error by the `__type__ === Symbol.for("BudgetRejectedError")` brand via the
static guard — never by `instanceof`, so it survives duplicated module
instances across bundles.

## Constructor

```ts
constructor(message: string);
```

## Properties

### __type__

```ts
__type__: symbol
```

Runtime brand (Symbol.for — survives duplicated module instances)

## Methods

### isBudgetRejectedError

```ts
static isBudgetRejectedError(error: object): boolean;
```

Nominal type guard by the runtime brand. Use this instead of `instanceof`:
the check is based on `Symbol.for`, so it recognizes instances created by a
DIFFERENT copy of this module (duplicated bundles, linked packages).

### fromError

```ts
static fromError(error: object): BudgetRejectedError;
```

Nominal constructor for a new BudgetRejectedError from any thrown object.
