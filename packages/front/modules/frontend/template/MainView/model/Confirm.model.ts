export interface ConfirmModel {
  displayName: string;
  symbol: string;
  position: "long" | "short";
  takeProfitPrice: number;
  stopLossPrice: number;
  currentPrice: number;
  comment: string;
  info: string;
  date: string;
  estimatedMinutes: number;
}
