import { ISimulatorIdea, SimulatorName } from "../interfaces/Simulator.interface";

import backtest from "../lib";

const METHOD_NAME_RUN = "Simulator.run";

/**
 * Public API of the Simulator entity — parameter sweep over crowd
 * trading ideas.
 *
 * Finds production strategy parameters (hard stop, trailing take,
 * hold duration, entry consensus threshold) by profiling every idea
 * with one candle pass and evaluating the whole grid arithmetically
 * from the profiles. The result carries four ranking winners
 * (Sharpe, Sortino, PnL), the trained author whitelist/ban list and
 * per-point reports with trade-level detail.
 *
 * The simulator picks candidates — validation of the chosen
 * parameters MUST be a real engine backtest (Backtest.run).
 */
export class SimulatorUtils {
    /**
     * Runs the full simulation for a symbol through the service
     * stack (global -> core/connection -> ClientSimulator):
     * profiles -> author filter training -> grid evaluation ->
     * rankings. The referenced simulator schema must be registered
     * via addSimulatorSchema beforehand.
     *
     * @param dto.symbol - Trading pair symbol to simulate (e.g., "BTCUSDT")
     * @param dto.simulatorName - Registered simulator name
     * @param dto.ideas - Ideas feed; other symbols are filtered out,
     * so one shared feed can be passed for every symbol
     * @returns Final simulation result (reports, rankings, author artifact)
     * @throws Error when the simulator or its exchange is not registered
     *
     * @example
     * ```typescript
     * import { Simulator } from "backtest-kit";
     *
     * const result = await Simulator.run({
     *   symbol: "BTCUSDT",
     *   simulatorName: "tv-ideas-simulator",
     *   ideas,
     * });
     * // result.best -> winners by sharpe / sortino / pnl
     * // result.allowedAuthors -> production whitelist
     * ```
     */
    public run = async (
        dto: {
            symbol: string;
            simulatorName: SimulatorName;
            ideas: ISimulatorIdea[];
        }
    ) => {
        backtest.loggerService.log(METHOD_NAME_RUN, {
            simulatorName: dto.simulatorName,
            ideasLen: dto.ideas.length,
            symbol: dto.symbol,
        });
        return await backtest.simulatorGlobalService.run(dto);
    }
}

/**
 * Singleton instance of SimulatorUtils — the public entry point:
 * `Simulator.run({ symbol, simulatorName, ideas })`.
 */
export const Simulator = new SimulatorUtils();
