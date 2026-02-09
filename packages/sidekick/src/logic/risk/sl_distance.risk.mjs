import { addRiskSchema } from "backtest-kit";
import RiskName from "../../enum/RiskName.mjs";

const SLIPPAGE_THRESHOLD = 0.2;

addRiskSchema({
  riskName: RiskName.StopLossDistanceRisk,
  validations: [
    {
      validate: ({ currentSignal, currentPrice }) => {
        const {
          priceOpen = currentPrice,
          priceStopLoss,
          position,
        } = currentSignal;
        if (!priceOpen) {
          return;
        }
        // Calculate SL distance percentage
        const slDistance =
          position === "long"
            ? ((priceOpen - priceStopLoss) / priceOpen) * 100
            : ((priceStopLoss - priceOpen) / priceOpen) * 100;

        if (slDistance < SLIPPAGE_THRESHOLD) {
          throw new Error(`SL distance ${slDistance.toFixed(2)}% < 1%`);
        }
      },
      note: "SL distance must be at least 1%",
    },
  ],
});
