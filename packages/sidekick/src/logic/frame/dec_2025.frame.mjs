import { addFrameSchema } from "backtest-kit";
import FrameName from "../../enum/FrameName.mjs";

addFrameSchema({
  frameName: FrameName.December2025,
  interval: "1m",
  startDate: new Date("2025-12-01T00:00:00Z"),
  endDate: new Date("2025-12-31T23:59:59Z"),
  note: "Sideways movement without clear growth or decline",
});
