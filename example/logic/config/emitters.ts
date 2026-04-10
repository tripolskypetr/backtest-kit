import { Subject } from "functools-kit";
import { ERROR_SYMBOL } from "./constant";

export const errorEmitter = new Subject<typeof ERROR_SYMBOL>();
