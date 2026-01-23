import { inject } from "../../../lib/core/di";
import { createRequire } from "module";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { IPine, TPineCtor } from "../../../interface/Pine.interface";
import { singleshot } from "functools-kit";

const require = createRequire(import.meta.url);

const REQUIRE_PINE_FACTORY = (): TPineCtor | null => {
    try {
        // @ts-ignore
        const { PineTS } = require("pinets");
        // @ts-ignore
        return PineTS;
    } catch {
        return null;
    }
}

const IMPORT_PINE_FACTORY = async (): Promise<TPineCtor | null> => {
    try {
        // @ts-ignore
        const { PineTS } = await import("pinets");
        // @ts-ignore
        return PineTS;
    } catch {
        return null;
    }
}

const LOAD_PINE_FACTORY_FN = singleshot(async () => {
    let ctor: TPineCtor | null = null;
    if (ctor = REQUIRE_PINE_FACTORY()) {
        return ctor;
    }
    if (ctor = await IMPORT_PINE_FACTORY()) {
        return ctor;
    }
    throw new Error("PineTS import failed. Call usePine to provide a PineTS class to @backtest-kit/pinets.");
})

export class PineConnectionService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    private PineFactory: TPineCtor;

    public getInstance = async (...args: Parameters<TPineCtor>): Promise<IPine> => {
        this.loggerService.log("pineConnectionService getInstance", {
            args,
        });
        if (!this.PineFactory) {
            this.PineFactory = await LOAD_PINE_FACTORY_FN();
        }
        if (!this.PineFactory) {
            throw new Error("PineTS import failed. Call usePine to provide a PineTS class to @backtest-kit/pinets.");   
        }
        return Reflect.construct(this.PineFactory, args);
    }

    public usePine = (ctor: TPineCtor) => {
        this.loggerService.log("pineConnectionService usePine", {
            ctor,
        });
        this.PineFactory = ctor;
    }

    public clear = () => {
        this.loggerService.log("pineConnectionService clear");
        LOAD_PINE_FACTORY_FN.clear();
        this.PineFactory = null;
    }

}

export default PineConnectionService;
