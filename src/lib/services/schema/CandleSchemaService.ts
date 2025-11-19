import { ICandleSchema } from "../../../interfaces/Candle.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";

export class CandleSchemaService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _candleSchema: ICandleSchema;

  public getSchema = () => {
    this.loggerService.log("candleSchemaService getSchema");
    if (!this._candleSchema) {
      throw new Error("CandleSchemaService no candle source provided");
    }
    return this._candleSchema;
  };

  public addSchema = (candleSchema: ICandleSchema) => {
    this.loggerService.log("candleSchemaService addSchema");
    this._candleSchema = candleSchema;
  };
}

export default CandleSchemaService;
