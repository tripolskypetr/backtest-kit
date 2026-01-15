import { addFrame } from "backtest-kit";
import FrameName from "../../enum/FrameName.mjs";

addFrame({
  frameName: FrameName.October2025,
  interval: "1m",
  startDate: new Date("2025-10-01T00:00:00Z"),
  endDate: new Date("2025-10-31T23:59:59Z"),
  note: "Резкое падение рынка с 9 по 11 число",
});
