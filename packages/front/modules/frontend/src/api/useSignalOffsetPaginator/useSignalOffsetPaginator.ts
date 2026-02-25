import { pickDocuments, useOffsetPaginator } from "react-declarative";
import makeItemIterator from "./core/makeItemIterator";
import { ISignal } from "./model/Signal.model";

export const useSignalOffsetPaginator = (mode: "live" | "backtest") =>
    useOffsetPaginator<ISignal>({
        handler: async (limit, offset) => {
            const iter = pickDocuments<ISignal>(limit, offset);
            for await (const document of makeItemIterator(mode)) {
                if (iter([document]).done) {
                    break;
                }
            }
            return iter([]).rows;
        },
    });

export default useSignalOffsetPaginator;
