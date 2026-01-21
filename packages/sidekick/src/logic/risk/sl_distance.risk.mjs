import { addRiskSchema } from "backtest-kit";
import RiskName from "../../enum/RiskName.mjs";

addRiskSchema({
  riskName: RiskName.StopLossDistanceRisk,
  validations: [
    {
      validate: ({ pendingSignal, currentPrice }) => {
        const {
          priceOpen = currentPrice,
          priceStopLoss,
          position,
        } = pendingSignal;
        if (!priceOpen) {
          return;
        }
        // Calculate SL distance percentage
        const slDistance =
          position === "long"
            ? ((priceOpen - priceStopLoss) / priceOpen) * 100
            : ((priceStopLoss - priceOpen) / priceOpen) * 100;

        if (slDistance < 1) {
          throw new Error(`SL distance ${slDistance.toFixed(2)}% < 1%`);
        }
      },
      note: "SL distance must be at least 1%",
    },
  ],
});
