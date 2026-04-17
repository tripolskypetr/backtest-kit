interface ReactionResponseContract {
    price_reaction: "priced_in" | "not_priced_in" | "pricing_in";
    confidence: "reliable" | "not_reliable";
    reasoning: string;
}

export { ReactionResponseContract }
