interface SignalResponseContract {
  signal: "BUY" | "SELL" | "WAIT";
  reasoning: string;
}

export { SignalResponseContract };
