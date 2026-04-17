import { json } from "agent-swarm-kit";
import { OutlineName } from "../enum/OutlineName";
import { VolatilityResponseContract } from "../contract/VolatilityResponse.contract";

const volatility = async (
    symbol: string,
    when: Date,
) => {
    const response = await json<VolatilityResponseContract>(OutlineName.VolatilityOutline,
        symbol,
        when,
    );
    if (!response.data) {
        throw new Error("Volatility failed");
    }
    return { id: response.resultId, ...response.data };
}

export { volatility };
