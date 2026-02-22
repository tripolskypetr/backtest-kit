/**
 * Fix for `Attempted to assign to readonly property (at redactToken)`
 * @see https://github.com/telegraf/telegraf/issues/2078
 */
{
  const OriginalError = globalThis.Error;
  globalThis.Error = new Proxy(OriginalError, {
    construct(target, args) {
      const instance = new target(...args);

      let customMessage = instance.message;

      const handler = {
        get(target, prop, receiver) {
          if (prop === "message") {
            return customMessage;
          }
          return Reflect.get(target, prop, receiver);
        },
        set(target, prop, value, receiver) {
          if (prop === "message") {
            customMessage = value;
            return true;
          }
          return Reflect.set(target, prop, value, receiver);
        },
      };

      return new Proxy(instance, handler);
    },
  });
}

export {}
