import "./config/polyfill";
import "./config/setup";
import "./lib";

import "./main/backtest";
import "./main/paper";
import "./main/live";

import "./main/frontend";
import "./main/telegram";

export type { BaseModule, ILiveModule, LiveModule, TBaseModuleCtor } from "./interfaces/Module.interface";
export type { ILogger } from "./interfaces/Logger.interface";

export { type ExchangeName } from "./enum/ExchangeName";
export { type FrameName } from "./enum/FrameName";

export { setLogger } from "./functions/setup";

export { cli } from "./lib"
