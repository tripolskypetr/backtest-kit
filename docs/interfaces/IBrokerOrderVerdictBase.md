---
title: docs/interface/IBrokerOrderVerdictBase
group: docs
---

# IBrokerOrderVerdictBase

Framework-side resolution of an order gate (onOrderSync) or order check (onOrderCheck),
should not be discriminated by `reason`.

## Properties

### __type__

```ts
__type__: unique symbol
```

Discriminator for BrokerOrderVerdict union
