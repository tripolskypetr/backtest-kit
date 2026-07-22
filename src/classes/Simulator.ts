import { ISimulatorIdea, ISimulatorGridPoint, ISimulatorAuthorStat, SimulatorName } from "../interfaces/Simulator.interface";

import backtest from "../lib";

const METHOD_NAME_RUN = "Simulator.run";
const METHOD_NAME_TEST = "Simulator.test";

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
     * @returns Final simulation result (reports, rankings; the author artifact lives per-winner in best[])
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
     * // result.best -> winners by sharpe / sortino / pnl / recovery,
     * // each with authorStats/allowedAuthors under ITS OWN rule
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

    /**
     * Out-of-sample test of parameters picked by run(): evaluates
     * ONE frozen grid point over fresh ideas with a FROZEN author
     * track record. Nothing is trained on the test data — authors
     * unseen in the frozen stats are banned by default, test
     * outcomes never feed back into the stats. This is the honesty
     * step run() deliberately skips (its author training uses
     * lookahead inside the train range).
     *
     * @param dto.symbol - Trading pair symbol to test (e.g., "BTCUSDT")
     * @param dto.simulatorName - Registered simulator name
     * @param dto.ideas - Out-of-sample ideas feed; other symbols are
     * filtered out, so one shared feed can be passed for every symbol
     * @param dto.point - Frozen grid point from the train run
     * (e.g., the Sharpe winner's `best.report.point`)
     * @param dto.authorStats - Frozen author track record of the
     * CHOSEN winner (`best.authorStats` — hits are counted under that
     * winner's rule metric, so take them from the same best[] entry
     * as the point; the banned flag is re-derived under the rule)
     * @returns Out-of-sample result: the point report with the same
     * metrics as run(), the trade list and the frozen author artifact
     * @throws Error when the simulator or its exchange is not registered
     *
     * @example
     * ```typescript
     * import { Simulator } from "backtest-kit";
     *
     * // train on June...
     * const train = await Simulator.run({
     *   symbol: "BTCUSDT",
     *   simulatorName: "tv-ideas-simulator",
     *   ideas: juneIdeas,
     * });
     * const winner = train.best.find(({ criterion }) => criterion === "sharpe");
     *
     * // ...prove on July the training never saw
     * const test = await Simulator.test({
     *   symbol: "BTCUSDT",
     *   simulatorName: "tv-ideas-simulator",
     *   ideas: julyIdeas,
     *   point: winner.report.point,
     *   authorStats: winner.authorStats,
     * });
     * // test.report -> out-of-sample sharpe / pnl / drawdown
     * ```
     */
    public test = async (
        dto: {
            symbol: string;
            simulatorName: SimulatorName;
            ideas: ISimulatorIdea[];
            point: ISimulatorGridPoint;
            authorStats: ISimulatorAuthorStat[];
        }
    ) => {
        backtest.loggerService.log(METHOD_NAME_TEST, {
            simulatorName: dto.simulatorName,
            ideasLen: dto.ideas.length,
            symbol: dto.symbol,
            point: dto.point,
        });
        return await backtest.simulatorGlobalService.test(dto);
    }
}

/**
 * Singleton instance of SimulatorUtils — the public entry point:
 * `Simulator.run({ symbol, simulatorName, ideas })`.
 */
export const Simulator = new SimulatorUtils();
