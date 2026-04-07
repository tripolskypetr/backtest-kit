interface ResearchResponseContract {
  signal: "BUY" | "SELL" | "WAIT";
  reasoning: string;
}

export { ResearchResponseContract };
