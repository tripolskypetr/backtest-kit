interface ReactionResponseContract {
    price_reaction: "priced_in" | "not_priced_in" | "pricing_in";
    reasoning: string;
}

export { ReactionResponseContract }
