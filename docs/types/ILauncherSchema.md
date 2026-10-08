---
title: docs/type/ILauncherSchema
group: docs
---

# ILauncherSchema

```ts
type ILauncherSchema = ILauncherBacktestArgs | ILauncherPaperArgs | ILauncherLiveArgs;
```

Registration schema of a launcher instance.

Discriminated union over the run mode: exactly one of the backtest,
paper or live flags picks the pipeline Launcher.run starts for every
symbol of the schema's symbolList.
- launcherName — registry key; duplicate registration is a validation error.
- symbolList — symbols launched in the background, one instance each.
- strategyName / exchangeName / frameName — optional: when omitted, the
  SINGLE registered schema of that kind is used; with two or more
  registered the launcher must name one explicitly — ambiguity is an
  error, not a guess.
- callbacks — all optional; an omitted callback is simply never fired.
