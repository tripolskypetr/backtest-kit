---
title: docs/api-reference/class/ExchangeValidationService
group: docs
---

# ExchangeValidationService

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
