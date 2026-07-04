import { isObject } from "functools-kit";

const omitValue = (value: unknown, keys: string[]): unknown => {
  if (isObject(value)) {
    return omit(value as Record<string, unknown>, ...keys);
  }
  if (Array.isArray(value)) {
    return value.map((item) => omitValue(item, keys));
  }
  return value;
};

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

      (acc as Record<string, unknown>)[key] = omitValue(value, keys);

      return acc;
    },
    {} as Omit<T, K>,
  );
}

export default omit;
