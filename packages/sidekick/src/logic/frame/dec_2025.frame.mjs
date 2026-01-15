import { addFrame } from "backtest-kit";
import FrameName from "../../enum/FrameName.mjs";

addFrame({
  frameName: FrameName.December2025,
  interval: "1m",
  startDate: new Date("2025-12-01T00:00:00Z"),
  endDate: new Date("2025-12-31T23:59:59Z"),
  note: "Боковик без явного роста или падения",
});
