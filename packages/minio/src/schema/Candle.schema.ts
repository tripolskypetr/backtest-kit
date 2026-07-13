import { CandleInterval } from "backtest-kit";

interface ICandleDto {
  symbol: string;
  interval: CandleInterval;
  exchangeName: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ICandleRow extends ICandleDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { ICandleDto, ICandleRow };
