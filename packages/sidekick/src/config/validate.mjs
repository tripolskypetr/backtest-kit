import { validate } from "backtest-kit";
import ExchangeName from "../enum/ExchangeName.mjs";
import FrameName from "../enum/FrameName.mjs";
import RiskName from "../enum/RiskName.mjs";
import StrategyName from "../enum/StrategyName.mjs";

validate({
    ExchangeName,
    FrameName,
    RiskName,
    StrategyName,
})
