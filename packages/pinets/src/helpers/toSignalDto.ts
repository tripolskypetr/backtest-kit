import { ISignalDto } from "backtest-kit";
import { randomString } from "functools-kit";

interface SignalData {
  position: number;
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
}

interface Signal extends ISignalDto {
  id: string;
}

export function toSignalDto(data: SignalData): Signal | null {
  if (data.position === 1) {
    return {
      id: randomString(),
      position: "long",
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      minuteEstimatedTime: data.minuteEstimatedTime,
    };
  }

  if (data.position === -1) {
    return {
      id: randomString(),
      position: "short",
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      minuteEstimatedTime: data.minuteEstimatedTime,
    };
  }

  return null;
}

export default toSignalDto;
