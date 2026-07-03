import { ISignalDto } from "backtest-kit";

type ResultId = string | number;

interface SignalData {
  position: number;
  priceOpen?: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
}

interface Signal extends ISignalDto {
  id: string;
}

const IS_VALID_PRICE_OPEN_FN = (value: number | null | undefined): value is number =>
  typeof value === "number" && isFinite(value) && value > 0;

export function toSignalDto(
  id: ResultId,
  data: SignalData,
  priceOpen: number | null | undefined = data.priceOpen,
): Signal | null {
  if (data.position === 1) {
    const result: Signal = {
      id: String(id),
      position: "long",
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      minuteEstimatedTime: data.minuteEstimatedTime,
    };
    if (IS_VALID_PRICE_OPEN_FN(priceOpen)) {
      Object.assign(result, { priceOpen });
    }
    return result;
  }

  if (data.position === -1) {
    const result: Signal = {
      id: String(id),
      position: "short",
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      minuteEstimatedTime: data.minuteEstimatedTime,
    };
    if (IS_VALID_PRICE_OPEN_FN(priceOpen)) {
      Object.assign(result, { priceOpen });
    }
    return result;
  }

  return null;
}

export default toSignalDto;
