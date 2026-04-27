interface SignalEntryModel {
  publishedAt: string;
  symbol: string;
  direction: "long" | "short";
  entry: { from: number; to: number };
  targets: number[];
  stoploss: number;
  note: string;
}

export { SignalEntryModel }
