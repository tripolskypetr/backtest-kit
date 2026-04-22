export interface SymbolConfig {
  icon: string;
  logo: string;
  symbol: string;
  displayName: string;
  color: string;
  priority: number;
  description: string;
}

export interface NotificationConfig {
  signal: boolean;
  risk: boolean;
  info: boolean;
  breakeven: boolean;
  common_error: boolean;
  critical_error: boolean;
  validation_error: boolean;
  partial_loss: boolean;
  partial_profit: boolean;
  signal_sync: boolean;
  strategy_commit: boolean;
}
