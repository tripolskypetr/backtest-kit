import { ExchangeName } from "./Exchange.interface";
import { FrameName } from "./Frame.interface";
import { StrategyName } from "./Strategy.interface";

/**
 * Lifecycle callbacks of a launcher instance (all optional).
 *
 * An omitted callback is simply never fired.
 */
export interface ILauncherCallbacks {
    /**
     * Fired before Launcher.run blocks on waitForReady — the place to kick
     * off lazy schema registration (dynamic imports, remote config) so the
     * registries fill in while run waits for them.
     */
    onWaitForInit(launcherName: LauncherName): void | Promise<void>;
}

/**
 * Base registration arguments shared by every launcher run mode.
 *
 * A launcher binds a symbol list to optional strategy and exchange
 * references; everything left out is resolved implicitly from the
 * registries at run time — a setup with one strategy and one exchange
 * needs nothing but the symbol list and a mode flag.
 */
export interface ILauncherArgs {
    /** Unique launcher identifier for the schema registry */
    launcherName: LauncherName;
    /** Trading pair symbols (e.g., "BTCUSDT") the launcher starts an instance for */
    symbolList: string[];
    /** Strategy to run. Optional: defaults to the single registered strategy; ambiguous (2+ registered) requires it */
    strategyName?: StrategyName;
    /** Exchange to run on. Optional: defaults to the single registered exchange; ambiguous (2+ registered) requires it */
    exchangeName?: ExchangeName;
    /** Lifecycle callbacks (all optional) */
    callbacks?: Partial<ILauncherCallbacks>;
}

/**
 * Launcher running every symbol through the backtest pipeline
 * (Backtest.background) over a historical frame window.
 */
export interface ILauncherBacktestArgs extends ILauncherArgs {
    /** Discriminator for type-safe union: run the backtest pipeline */
    backtest: true;
    /** Timeframe bounding the run. Optional: defaults to the single registered frame; ambiguous (2+ registered) requires it */
    frameName?: FrameName;
    /** Warm the 1m candle cache over the frame window before launching. Default: GLOBAL_CONFIG.CC_LAUNCHER_CANDLE_CACHE_DEFAULT */
    cache?: boolean;
}

/**
 * Launcher running every symbol through the live pipeline
 * (Live.background) without placing real orders.
 */
export interface ILauncherPaperArgs extends ILauncherArgs {
    /** Discriminator for type-safe union: run the live pipeline in paper mode */
    paper: true;
}

/**
 * Launcher running every symbol through the live pipeline
 * (Live.background) with real trading.
 */
export interface ILauncherLiveArgs extends ILauncherArgs {
    /** Discriminator for type-safe union: run the live pipeline */
    live: true;
}

/**
 * Registration schema of a launcher instance.
 *
 * Discriminated union over the run mode: exactly one of the backtest,
 * paper or live flags picks the pipeline Launcher.run starts for every
 * symbol of the schema's symbolList.
 * - launcherName — registry key; duplicate registration is a validation error.
 * - symbolList — symbols launched in the background, one instance each.
 * - strategyName / exchangeName / frameName — optional: when omitted, the
 *   SINGLE registered schema of that kind is used; with two or more
 *   registered the launcher must name one explicitly — ambiguity is an
 *   error, not a guess.
 * - callbacks — all optional; an omitted callback is simply never fired.
 */
export type ILauncherSchema =
  | ILauncherBacktestArgs
  | ILauncherPaperArgs
  | ILauncherLiveArgs;

/**
 * Unique launcher identifier.
 */
export type LauncherName = string;
