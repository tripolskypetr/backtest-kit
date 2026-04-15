import { singleshot } from "functools-kit";
import Perplexity from '@perplexity-ai/perplexity_ai';

export const getPerplexity = singleshot(() => {
    return new Perplexity({
        apiKey: process.env.PERPLEXITY_TOKEN,
    });
})
