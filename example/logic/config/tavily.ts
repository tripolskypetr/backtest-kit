import { singleshot } from "functools-kit";
import { tavily } from "@tavily/core";

export const getTavily = singleshot(() => {
    return tavily({
        apiKey: process.env.TAVILY_TOKEN,
    })
})
