interface IParams {
    term: "1m" | "15m" | "1h";
}

export const getParams = (): Partial<IParams> => {
    const url = new URL(location.href, location.origin);
    const term = url.searchParams.get("term") as IParams["term"];
    return {
        term: term ?? undefined,
    }
}
