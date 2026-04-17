import { json } from "agent-swarm-kit";
import { OutlineName } from "../enum/OutlineName";
import { ForecastResponseContract } from "../contract/ForecastResponse.contract";
import { ReactionResponseContract } from "../contract/ReactionResponse.contract";

const reaction = async (
    forecast: ForecastResponseContract,
    symbol: string,
    when: Date,
) => {
    const response = await json<ReactionResponseContract>(OutlineName.ReactionOutline,
        forecast,
        symbol,
        when,
    );
    if (!response.data) {
        throw new Error("Reaction failed");
    }
    return { id: response.resultId, ...response.data };
}

export { reaction };
