---
title: docs/class/BudgetMissingError
group: docs
---

# BudgetMissingError

Extends `Error`

A static `Budget` call reached a record that does not exist yet and gave no
`initialCapital` to create it with.

A record is created by the first call that touches it. The strategy's own
instance methods always carry the capital of `new Budget({ name, initialCapital })`;
a static call (a listener, a dashboard) that comes first would otherwise create
the record with a capital it does not know, and a later call with the right
capital could never repair it. So the call is refused, nothing is created,
and the next call that brings `initialCapital` creates the record properly.

Nominal runtime identification: the framework and user code recognize the
error by the `__type__ === Symbol.for("BudgetMissingError")` brand via the
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

### isBudgetMissingError

```ts
static isBudgetMissingError(error: object): boolean;
```

Nominal type guard by the runtime brand. Use this instead of `instanceof`:
the check is based on `Symbol.for`, so it recognizes instances created by a
DIFFERENT copy of this module (duplicated bundles, linked packages).

### fromError

```ts
static fromError(error: object): BudgetMissingError;
```

Nominal constructor for a new BudgetMissingError from any thrown object.
