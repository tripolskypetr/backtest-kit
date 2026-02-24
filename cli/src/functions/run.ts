import cli from "../lib";

import * as backtest from "../main/backtest";
import * as paper from "../main/paper";
import * as live from "../main/live";

type PayloadBacktest = Parameters<typeof cli.backtestMainService.run>[0];
type PayloadPaper = Parameters<typeof cli.paperMainService.run>[0];
type PayloadLive = Parameters<typeof cli.liveMainService.run>[0];

type Mode = "backtest" | "live" | "paper";

type Args =
  | Partial<PayloadBacktest>
  | Partial<PayloadPaper>
  | Partial<PayloadLive>;

let _is_started = false;

export async function run(mode: Mode, args: Args) {
  {
    if (_is_started) {
        throw new Error("Should be called only once");
    }
    _is_started = true;
  }
  if (mode === "backtest") {
    await cli.backtestMainService.run(<PayloadBacktest>args);
    backtest.listenGracefulShutdown();
    return;
  }
  if (mode === "paper") {
    await cli.paperMainService.run(<PayloadPaper>args);
    paper.listenGracefulShutdown();
    return;
  }
  if (mode === "live") {
    await cli.liveMainService.run(<PayloadLive>args);
    live.listenGracefulShutdown();
    return;
  }
  throw new Error(`Invalid mode: ${mode}`);
}
