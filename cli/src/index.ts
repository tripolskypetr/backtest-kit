import "./config/polyfill";
import "./config/setup";
import "./lib";

import "./main/backtest";
import "./main/paper";
import "./main/live";

import "./main/frontend";
import "./main/telegram";

export { ExchangeName } from "./enum/ExchangeName";
export { FrameName } from "./enum/FrameName";

export { setLogger } from "./functions/setup";

export { cli } from "./lib"
