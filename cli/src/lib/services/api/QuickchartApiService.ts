import QuickChart from "quickchart-js";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { CandleInterval, getCandles } from "backtest-kit";
import LoggerService from "../base/LoggerService";
import { getEnv } from "../../../helpers/getEnv";

const CANDLES_LIMIT = 160;

const GET_CONFIG_FN = async (
  symbol: string,
  interval: string,
) => {
  const candles = await getCandles(
    symbol,
    <CandleInterval>interval,
    CANDLES_LIMIT,
  );

  const labels = candles.map(({ timestamp }) =>
    new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  const closes = candles.map(({ close }) => close);

  const chartConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${symbol} ${interval}`,
          data: closes,
          borderColor: "rgb(75, 192, 192)",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.2,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `${symbol} Closing Prices (${interval})`,
        },
        legend: { display: false },
      },
      scales: {
        x: { display: false },
        y: { display: true },
      },
    },
  };

  return chartConfig;
};

export class QuickchartApiService {
  public readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getChart = async (symbol: string, interval: string) => {
    this.loggerService.log("quickchartApiService getMinuteChart", {
      symbol,
    });

    const chartConfig = await GET_CONFIG_FN(symbol, interval);
    const { CC_QUICKCHART_HOST } = getEnv();

    const qc = new QuickChart();

    if (CC_QUICKCHART_HOST) {
      qc.setHost(CC_QUICKCHART_HOST);
    }

    {
      qc.setConfig(chartConfig);
      qc.setWidth(512);
      qc.setHeight(512);
      qc.setFormat("png");
    }

    return await qc.toBinary();
  };
}

export default QuickchartApiService;
