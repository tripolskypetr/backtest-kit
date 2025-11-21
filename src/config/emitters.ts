import { Subject } from "functools-kit";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";

export const signalEmitter = new Subject<IStrategyTickResult>();
