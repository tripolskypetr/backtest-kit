import { addAdvisor } from "agent-swarm-kit";
import { AdvisorName } from "../../enum/AdvisorName";
import { StockDataRequestContract } from "../../contract/StockDataRequest.contract";
import { formatPrice, formatQuantity, getCandles } from "backtest-kit";
import dayjs from "dayjs";

const CANDLES_LIMIT = 24; // 24 x 1h = 24 часа истории

addAdvisor({
  advisorName: AdvisorName.StockDataAdvisor,
  getChat: async ({ symbol }: StockDataRequestContract) => {
    console.log(`StockDataAdvisor called with symbol: ${symbol}`);

    const candles = await getCandles(symbol, "1h", CANDLES_LIMIT);

    let markdown = `## 1-Hour Candles (Last ${CANDLES_LIMIT})\n`;
    markdown += `> Symbol: ${String(symbol).toUpperCase()}\n\n`;
    markdown += `| # | Time | Open | High | Low | Close | Volume | Change % | Volatility % | Body % |\n`;
    markdown += `|---|------|------|------|-----|-------|--------|----------|--------------|--------|\n`;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const volatility = ((c.high - c.low) / c.close) * 100;
      const bodySize = Math.abs(c.close - c.open);
      const range = c.high - c.low;
      const bodyPct = range > 0 ? (bodySize / range) * 100 : 0;
      const changePct = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
      const time = dayjs.utc(c.timestamp).format("YYYY-MM-DD HH:mm") + " UTC";

      const open = await formatPrice(symbol, c.open);
      const high = await formatPrice(symbol, c.high);
      const low = await formatPrice(symbol, c.low);
      const close = await formatPrice(symbol, c.close);
      const volume = formatQuantity(symbol, c.volume);

      markdown += `| ${i + 1} | ${time} | ${open} | ${high} | ${low} | ${close} | ${volume} | ${changePct.toFixed(3)}% | ${volatility.toFixed(2)}% | ${bodyPct.toFixed(1)}% |\n`;
    }

    return markdown;
  },
});
