import lib from "../lib";
import { TPineCtor } from "src/interface/Pine.interface";

const METHOD_NAME_USE_PINE = "pine.usePine";

export function usePine<T = TPineCtor>(ctor: T) {
    lib.loggerService.log(METHOD_NAME_USE_PINE, {
        ctor,
    });
    lib.pineConnectionService.usePine(<TPineCtor>ctor);
}
