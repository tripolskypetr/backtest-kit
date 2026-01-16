---
title: docs/interface/IActionSchema
group: docs
---

# IActionSchema

Action schema registered via addAction().
Defines event handler implementation and lifecycle callbacks for state management integration.

Actions provide a way to attach custom event handlers to strategies for:
- State management (Redux, Zustand, MobX)
- Event logging and monitoring
- Real-time notifications (Telegram, Discord, email)
- Analytics and metrics collection
- Custom business logic triggers

Each action instance is created per strategy-frame pair and receives all events
emitted during strategy execution. Multiple actions can be attached to a single strategy.

## Properties

### actionName

```ts
actionName: string
```

Unique action identifier for registration

### handler

```ts
handler: TActionCtor | Partial<IPublicAction>
```

Action handler constructor (instantiated per strategy-frame pair)

### callbacks

```ts
callbacks: Partial<IActionCallbacks>
```

Optional lifecycle and event callbacks
