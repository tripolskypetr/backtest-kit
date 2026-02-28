import lib from "../lib";
import { TIndicatorCtor } from "../interface/Indicator.interface";

const METHOD_NAME_USE_PINE = "indicator.useIndicator";

export function useIndicator<T = TIndicatorCtor>(ctor: T) {
    lib.loggerService.log(METHOD_NAME_USE_PINE, {
        ctor,
    });
    lib.indicatorConnectionService.useIndicator(<TIndicatorCtor>ctor);
}
