import { json } from "agent-swarm-kit";
import { OutlineName } from "../enum/OutlineName";
import { GridResponseContract } from "../contract/GridResponse.contract";

const grid = async (symbol: string, when: Date) => {
    const response = await json<GridResponseContract>(OutlineName.GridOutline, symbol, when);
    if (!response.data) {
        throw new Error("Research failed");
    }
    return { id: response.resultId, ...response.data };
}

export { grid };
