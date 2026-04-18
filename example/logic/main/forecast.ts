import { json } from "agent-swarm-kit";
import { OutlineName } from "../enum/OutlineName";
import { ForecastResponseContract } from "../contract/ForecastResponse.contract";

const forecast = async (symbol: string, when: Date) => {
    const response = await json<ForecastResponseContract>(OutlineName.ForecastOutline, symbol, when);
    if (!response.data) {
        throw new Error("Forecast failed");
    }
    return { id: response.resultId, ...response.data };
}

export { forecast };
