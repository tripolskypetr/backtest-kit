import { addFrame } from "backtest-kit";
import FrameName from "../../enum/FrameName.mjs";

addFrame({
  frameName: FrameName.November2025,
  interval: "1m",
  startDate: new Date("2025-11-01T00:00:00Z"),
  endDate: new Date("2025-11-30T23:59:59Z"),
  note: "Боковик с общим трендом вниз и незначительными отскоками",
});
