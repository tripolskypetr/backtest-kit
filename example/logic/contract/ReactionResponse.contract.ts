interface ReactionResponseContract {
    price_reaction: "priced_in" | "not_priced_in" | "pricing_in";
    confidence: "reliable" | "not_reliable";
    trade_action: "enter" | "wait";
    reasoning: string;
}

export { ReactionResponseContract }
