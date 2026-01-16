import * as BacktestKit from "backtest-kit";

declare global {
    namespace bt {
        export * from "backtest-kit";
    }

    const bt: typeof BacktestKit;
}

export {};
