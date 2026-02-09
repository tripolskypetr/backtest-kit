import { addFrameSchema } from "backtest-kit";
import FrameName from "../../enum/FrameName.mjs";

addFrameSchema({
  frameName: FrameName.February2024,
  interval: "1m",
  startDate: new Date("2024-02-01T00:00:00Z"),
  endDate: new Date("2024-02-29T23:59:59Z"),
  note: "Bull run period",
});
