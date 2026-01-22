import { PineTS } from "pinets";
import { AxisProvider, AXIS_SYMBOL } from "./AxisProvider";
import { CandleProvider } from "./CandleProvider";
import { IProvider } from "../interface/Provider.interface";
import { CandleInterval, getDate } from "backtest-kit";

export class PineRunner {
  private pineTS: PineTS | null = null;

  public run = async(
    script: string | Function,
    timeframe: string = "1h",
    limit: number = 100,
  ) => {

    // Инициализируем PineTS с осью времени
    const candleProvider = new CandleProvider();
    const axisProvider = new AxisProvider();

    const provider: IProvider = {
      async getMarketData(tickerId, timeframe, limit, sDate, eDate) {
        if (tickerId === AXIS_SYMBOL) {
          return axisProvider.getMarketData(tickerId, timeframe, limit, sDate, eDate);
        }
        return candleProvider.getMarketData(
          tickerId,
          timeframe,
          limit,
          sDate,
          eDate,
        );
      },

      async getSymbolInfo(tickerId) {
        if (tickerId === AXIS_SYMBOL) {
          return axisProvider.getSymbolInfo();
        }
        return candleProvider.getSymbolInfo(tickerId);
      },
    };

    this.pineTS = new PineTS(provider, AXIS_SYMBOL, timeframe, limit);
    await this.pineTS.ready();

    return await this.pineTS.run(script);
  }
}

export default PineRunner;
