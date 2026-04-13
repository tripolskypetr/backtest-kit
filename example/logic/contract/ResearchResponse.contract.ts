interface ResearchResponseContract {
  signal: "BUY" | "SELL" | "WAIT";
  reasoning: string;
  entryConfirmation: string;
  reversalSignal: string;
}

export { ResearchResponseContract };
