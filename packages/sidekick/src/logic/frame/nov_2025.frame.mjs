import { addFrameSchema } from "backtest-kit";
import FrameName from "../../enum/FrameName.mjs";

addFrameSchema({
  frameName: FrameName.November2025,
  interval: "1m",
  startDate: new Date("2025-11-01T00:00:00Z"),
  endDate: new Date("2025-11-30T23:59:59Z"),
  note: "Sideways movement with overall downtrend and minor bounces",
});
