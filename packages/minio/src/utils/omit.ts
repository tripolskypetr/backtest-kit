export function omit<T extends any, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const excluded = new Set(keys);
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !excluded.has(key as K))
  ) as Omit<T, K>;
}