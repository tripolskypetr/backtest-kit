import { addRiskSchema } from "backtest-kit";
import RiskName from "../../enum/RiskName.mjs";

const SLIPPAGE_THRESHOLD = 0.2;

addRiskSchema({
  riskName: RiskName.TakeProfitDistanceRisk,
  validations: [
    {
      validate: ({ currentSignal, currentPrice }) => {
        const {
          priceOpen = currentPrice,
          priceTakeProfit,
          position,
        } = currentSignal;
        if (!priceOpen) {
          return;
        }
        // Calculate TP distance percentage
        const tpDistance =
          position === "long"
            ? ((priceTakeProfit - priceOpen) / priceOpen) * 100
            : ((priceOpen - priceTakeProfit) / priceOpen) * 100;

        if (tpDistance < SLIPPAGE_THRESHOLD) {
          throw new Error(`TP distance ${tpDistance.toFixed(2)}% < 1%`);
        }
      },
      note: "TP distance must be at least 1%",
    },
  ],
});
