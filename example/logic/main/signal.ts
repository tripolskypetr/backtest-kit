import { json } from "agent-swarm-kit";
import { OutlineName } from "../enum/OutlineName";
import { SignalResponseContract } from "../contract/SignalResponse.contract";

const signal = async (symbol: string, when: Date) => {
    const response = await json<SignalResponseContract>(OutlineName.SignalOutline, symbol, when);
    if (!response.data) {
        throw new Error("Signal failed");
    }
    return { id: response.resultId, ...response.data };
}

export { signal };
