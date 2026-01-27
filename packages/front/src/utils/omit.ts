import { isObject } from "functools-kit";

export function omit<T extends object, K extends string>(
  obj: T,
  ...keys: K[]
): Omit<T, K> {
  const keySet = new Set(keys);

  return Object.keys(obj).reduce(
    (acc, key) => {
      if (keySet.has(<K>key)) {
        return acc;
      }

      const value = (obj as Record<string, unknown>)[key];

      if (isObject(value)) {
        (acc as Record<string, unknown>)[key] = omit(
          value as Record<string, unknown>,
          ...keys,
        );
      } else {
        (acc as Record<string, unknown>)[key] = value;
      }

      return acc;
    },
    {} as Omit<T, K>,
  );
}

export default omit;
