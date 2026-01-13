import History from "./History.contract";

export type ReportFn = (symbol: string, history: History) => Promise<void>;
