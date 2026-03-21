const normalize = (s: string): string =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (text: string): string[] =>
  normalize(String(text || ""))
    .split(" ")
    .filter(Boolean);

export const createSearchIndex = () => {
  const df = new Map<string, number>();
  const docs = new Map<
    string,
    { tf: Map<string, number>; len: number; content: string }
  >();
  const k1 = 1.5,
    b = 0.75;

  const recomputeDf = () => {
    df.clear();
    for (const doc of docs.values())
      doc.tf.forEach((_, term) => df.set(term, (df.get(term) ?? 0) + 1));
  };

  const upsert = (id: string, content: string, index?: string) => {
    const tokens = tokenize(index ?? content);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    docs.set(id, { tf, len: tokens.length, content });
    recomputeDf();
  };

  const read = (id: string): string | undefined => docs.get(id)?.content;

  const remove = (id: string) => {
    docs.delete(id);
    recomputeDf();
  };

  const list = (): Array<{ id: string; content: string }> =>
    Array.from(docs.entries()).map(([id, { content }]) => ({ id, content }));

  const search = (
    query: string,
  ): Array<{ id: string; score: number; content: string }> => {
    const terms = tokenize(query);
    if (!terms.length || !docs.size) return [];

    const N = docs.size;
    const avgLen = [...docs.values()].reduce((s, d) => s + d.len, 0) / N;

    return [...docs.entries()]
      .map(([id, doc]) => {
        let score = 0;
        for (const term of terms) {
          const matchedTokens = [...doc.tf.entries()].filter(([token]) =>
            token.includes(term),
          );

          for (const [token, freq] of matchedTokens) {
            const docsWithTerm = df.get(token) ?? 0;
            const idf = Math.log(
              (N - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1,
            );
            const tf =
              (freq * (k1 + 1)) /
              (freq + k1 * (1 - b + (b * doc.len) / avgLen));
            score += idf * tf;
          }
        }
        return { id, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ id, score }) => ({ id, content: docs.get(id).content, score }));
  };

  return { upsert, remove, list, search, read };
};

export default createSearchIndex;
