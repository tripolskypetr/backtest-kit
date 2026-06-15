---
title: docs/type/IBacktestLogicPrivateService
group: docs
---

# IBacktestLogicPrivateService

```ts
type IBacktestLogicPrivateService = Omit<BacktestLogicPrivateService, keyof {
    loggerService: never;
    strategyCoreService: never;
    exchangeCoreService: never;
    frameCoreService: never;
    actionCoreService: never;
    methodContextService: never;
    priceMetaService: never;
    timeMetaService: never;
}>;
```

Type definition for public BacktestLogic service.
Omits private dependencies from BacktestLogicPrivateService.
