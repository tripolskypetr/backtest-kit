import { Subject } from "functools-kit";
import ProgressOptimizerContract from "../contract/ProgressOptimizer.contract";

/**
 * Emitter for optimizer progress events.
 */
export const progressOptimizerEmitter = new Subject<ProgressOptimizerContract>();

/**
 * Emitter for error events.
 */
export const errorEmitter = new Subject<Error>();
