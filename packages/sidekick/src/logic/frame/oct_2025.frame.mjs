import { addFrameSchema } from "backtest-kit";
import FrameName from "../../enum/FrameName.mjs";

addFrameSchema({
  frameName: FrameName.October2025,
  interval: "1m",
  startDate: new Date("2025-10-01T00:00:00Z"),
  endDate: new Date("2025-10-31T23:59:59Z"),
  note: "Sharp market drop from the 9th to 11th",
});
