---
title: docs/function/addActionSchema
group: docs
---

# addActionSchema

```ts
declare function addActionSchema(actionSchema: IActionSchema): void;
```

Registers an action handler in the framework.

Actions provide event-driven integration for:
- State management (Redux, Zustand, MobX)
- Real-time notifications (Telegram, Discord, email)
- Event logging and monitoring
- Analytics and metrics collection
- Custom business logic triggers

Each action instance is created per strategy-frame pair and receives all events
emitted during strategy execution (signals, breakeven, partial profit/loss, etc.).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `actionSchema` | Action configuration object |
