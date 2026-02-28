import { inject } from "../../core/di";
import { createRequire } from "module";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import { IIndicator, TIndicatorCtor } from "../../../interface/Indicator.interface";
import { singleshot } from "functools-kit";

const require = createRequire(import.meta.url);

const REQUIRE_INDICATOR_FACTORY = (): TIndicatorCtor | null => {
    try {
        // @ts-ignore
        const { Indicator } = require("pinets");
        // @ts-ignore
        return Indicator;
    } catch {
        return null;
    }
}

const IMPORT_INDICATOR_FACTORY = async (): Promise<TIndicatorCtor | null> => {
    try {
        // @ts-ignore
        const { Indicator } = await import("pinets");
        // @ts-ignore
        return Indicator;
    } catch {
        return null;
    }
}

const LOAD_INDICATOR_FACTORY_FN = singleshot(async () => {
    let ctor: TIndicatorCtor | null = null;
    if (ctor = REQUIRE_INDICATOR_FACTORY()) {
        return ctor;
    }
    if (ctor = await IMPORT_INDICATOR_FACTORY()) {
        return ctor;
    }
    throw new Error("PineTS import failed (useIndicator). Call useIndicator to provide a PineTS class to @backtest-kit/pinets.");
})

export class IndicatorConnectionService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    private IndicatorFactory: TIndicatorCtor;

    public getInstance = async (...args: ConstructorParameters<TIndicatorCtor>): Promise<IIndicator> => {
        this.loggerService.log("indicatorConnectionService getInstance", {
            args,
        });
        if (!this.IndicatorFactory) {
            this.IndicatorFactory = await LOAD_INDICATOR_FACTORY_FN();
        }
        if (!this.IndicatorFactory) {
            throw new Error("PineTS import failed. Call useIndicator to provide a PineTS class to @backtest-kit/pinets.");   
        }
        return Reflect.construct(this.IndicatorFactory, args);
    }

    public useIndicator = (ctor: TIndicatorCtor) => {
        this.loggerService.log("indicatorConnectionService useIndicator", {
            ctor,
        });
        this.IndicatorFactory = ctor;
    }

    public clear = () => {
        this.loggerService.log("indicatorConnectionService clear");
        LOAD_INDICATOR_FACTORY_FN.clear();
        this.IndicatorFactory = null;
    }

}

export default IndicatorConnectionService;
