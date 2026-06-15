import { Subject } from "react-declarative";

export const commitOpenPendingEmitter = new Subject<void>();
export const commitAverageBuyEmitter = new Subject<void>();
export const commitClosePendingEmitter = new Subject<void>();
export const commitBreakevenEmitter = new Subject<void>();
