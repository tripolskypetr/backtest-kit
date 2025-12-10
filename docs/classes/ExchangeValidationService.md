---
title: docs/api-reference/class/ExchangeValidationService
group: docs
---

# ExchangeValidationService

Service for managing and validating exchange configurations.

Maintains a registry of all configured exchanges and validates
their existence before operations. Uses memoization for performance.

Key features:
- Registry management: addExchange() to register new exchanges
- Validation: validate() ensures exchange exists before use
- Memoization: validation results are cached for performance
- Listing: list() returns all registered exchanges

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### _exchangeMap

```ts
_exchangeMap: any
```

### addExchange

```ts
addExchange: (exchangeName: string, exchangeSchema: IExchangeSchema) => void
```

Adds an exchange schema to the validation service

### validate

```ts
validate: (exchangeName: string, source: string) => void
```

Validates the existence of an exchange

### list

```ts
list: () => Promise<IExchangeSchema[]>
```

Returns a list of all registered exchange schemas
