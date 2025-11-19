import backtest from "../lib/index";
import { IStrategySchema } from "../interfaces/Strategy.interface";
import { ICandleSchema } from "../interfaces/Candle.interface";

export const addStrategy = (strategySchema: IStrategySchema) => {
  backtest.strategySchemaService.addSchema(strategySchema);
};

export const addCandle = (candleSchema: ICandleSchema) => {
  backtest.candleSchemaService.addSchema(candleSchema);
};

export default { addStrategy, addCandle };
