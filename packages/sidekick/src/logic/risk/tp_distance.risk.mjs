import { addRiskSchema } from "backtest-kit";
import RiskName from "../../enum/RiskName.mjs";

addRiskSchema({
  riskName: RiskName.TakeProfitDistanceRisk,
  validations: [
    {
      validate: ({ pendingSignal, currentPrice }) => {
        const {
          priceOpen = currentPrice,
          priceTakeProfit,
          position,
        } = pendingSignal;
        if (!priceOpen) {
          return;
        }
        // Calculate TP distance percentage
        const tpDistance =
          position === "long"
            ? ((priceTakeProfit - priceOpen) / priceOpen) * 100
            : ((priceOpen - priceTakeProfit) / priceOpen) * 100;

        if (tpDistance < 1) {
          throw new Error(`TP distance ${tpDistance.toFixed(2)}% < 1%`);
        }
      },
      note: "TP distance must be at least 1%",
    },
  ],
});
