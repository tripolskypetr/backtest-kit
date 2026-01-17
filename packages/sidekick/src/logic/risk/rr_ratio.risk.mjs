import { addRiskSchema } from "backtest-kit";
import RiskName from "../../enum/RiskName.mjs";

addRiskSchema({
  riskName: RiskName.RiskRewardRatioRisk,
  validations: [
    {
      validate: ({ pendingSignal, currentPrice }) => {
        const {
          priceOpen = currentPrice,
          priceTakeProfit,
          priceStopLoss,
          position,
        } = pendingSignal;
        if (!priceOpen) {
          return;
        }
        // Calculate reward (TP distance)
        const reward =
          position === "long"
            ? priceTakeProfit - priceOpen
            : priceOpen - priceTakeProfit;
        // Calculate risk (SL distance)
        const risk =
          position === "long"
            ? priceOpen - priceStopLoss
            : priceStopLoss - priceOpen;
        if (risk <= 0) {
          throw new Error("Invalid SL: risk must be positive");
        }
        const rrRatio = reward / risk;
        if (rrRatio < 2) {
          throw new Error(`RR ratio ${rrRatio.toFixed(2)} < 2:1`);
        }
      },
      note: "Risk-Reward ratio must be at least 1:2",
    },
  ],
});
