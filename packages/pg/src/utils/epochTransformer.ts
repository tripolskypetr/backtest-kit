import { ValueTransformer } from "typeorm";

/**
 * Stores epoch-millisecond numbers in a Postgres `bigint` column while keeping
 * the JS-visible value a plain `number`. The `pg` driver returns `bigint` as a
 * string, so `from` parses it back; `to` passes the number through unchanged.
 */
export const epochTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null | undefined) =>
    value === null || value === undefined ? value : Number(value),
};
