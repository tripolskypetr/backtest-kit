import "./config/polyfill";
import "./config/setup";
import "./lib";

import "./main/start";

import "./main/backtest";
import "./main/walker";
import "./main/paper";
import "./main/live";

import "./main/frontend";
import "./main/telegram";

import "./main/pine";
import "./main/dump";
import "./main/init";
import "./main/help";

import "./main/version";

export type { ILogger } from "./interfaces/Logger.interface";
export type { ILoader } from "./interfaces/Loader.interface";
export type { IBabel } from "./interfaces/Babel.interface";

export { type ExchangeName } from "./enum/ExchangeName";
export { type FrameName } from "./enum/FrameName";

export { setLogger } from "./functions/setup";
export { run } from "./functions/run";

export { cli } from "./lib"
