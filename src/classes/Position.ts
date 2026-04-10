import backtest from "../lib";

const METHOD_NAME_MOONBAG = "Position.moonbag";
const METHOD_NAME_BRACKET = "Position.bracket";

/**
 * Utilities for calculating take profit and stop loss price levels.
 * Automatically inverts direction based on position type (long/short).
 */
export class Position {

    /**
     * Calculates levels for the "moonbag" strategy — fixed TP at 50% from the current price.
     * @param dto.position - position type: "long" or "short"
     * @param dto.currentPrice - current asset price
     * @param dto.percentStopLoss - stop loss percentage from 0 to 100
     * @returns priceTakeProfit and priceStopLoss in fiat
     */
    public static moonbag = (dto: {
        position: "long" | "short",
        currentPrice: number,
        percentStopLoss: number
    }) => {
        backtest.loggerService.log(METHOD_NAME_MOONBAG, { dto });
        const percentTakeProfit = 50;
        const sign = dto.position === "long" ? 1 : -1;
        return {
            position: dto.position,
            priceTakeProfit: dto.currentPrice * (1 + sign * percentTakeProfit / 100),
            priceStopLoss: dto.currentPrice * (1 - sign * dto.percentStopLoss / 100),
        }
    }

    /**
     * Calculates levels for a bracket order with custom TP and SL.
     * @param dto.position - position type: "long" or "short"
     * @param dto.currentPrice - current asset price
     * @param dto.percentStopLoss - stop loss percentage from 0 to 100
     * @param dto.percentTakeProfit - take profit percentage from 0 to 100
     * @returns priceTakeProfit and priceStopLoss in fiat
     */
    public static bracket = (dto: {
        position: "long" | "short",
        currentPrice: number,
        percentStopLoss: number,
        percentTakeProfit: number,
    }) => {
        backtest.loggerService.log(METHOD_NAME_BRACKET, { dto });
        const sign = dto.position === "long" ? 1 : -1;
        return {
            position: dto.position,
            priceTakeProfit: dto.currentPrice * (1 + sign * dto.percentTakeProfit / 100),
            priceStopLoss: dto.currentPrice * (1 - sign * dto.percentStopLoss / 100),
        }
    }

}
