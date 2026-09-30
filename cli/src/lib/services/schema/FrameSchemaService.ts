import { singleshot } from "functools-kit";
import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { addFrameSchema, listFrameSchema } from "tradeforge";
import FrameName from "../../../enum/FrameName";
import { getArgs } from "../../../helpers/getArgs";

const ADD_FRAME_FN = (self: FrameSchemaService) => {
  self.loggerService.log("Adding February 2024 as a default frame schema");
  console.warn("Warning: The default frame schema is set to February 2024. Please make sure to update it according to your needs using --frame cli param.");
  addFrameSchema({
    frameName: FrameName.DefaultFrame,
    interval: "1m",
    startDate: new Date("2024-02-01T00:00:00Z"),
    endDate: new Date("2024-02-29T23:59:59Z"),
  });
};

export class FrameSchemaService {
  public readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public addSchema = singleshot(async () => {
    this.loggerService.log("frameSchemaService addSchema");
    if (!getArgs().values.backtest) {
      return;
    }
    const { length } = await listFrameSchema();
    !length && ADD_FRAME_FN(this);
  });
}

export default FrameSchemaService;
