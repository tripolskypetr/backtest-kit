const DEFAULT_BM25_K1 = 1.5;
const DEFAULT_BM25_B = 0.75;

const USE_FULL_RECOMPUTE = false;

export type SearchSettings = {
  BM25_K1: number;
  BM25_B: number;
}

const DEFAULT_SETTINGS: SearchSettings = {
  BM25_K1: DEFAULT_BM25_K1,
  BM25_B: DEFAULT_BM25_B,
}

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
    { tf: Map<string, number>; len: number; content: object; priority: number }
  >();

  const recomputeDf = () => {
    df.clear();
    for (const doc of docs.values())
      doc.tf.forEach((_, term) => df.set(term, (df.get(term) ?? 0) + 1));
  };

  const addDf = (tf: Map<string, number>) => {
    tf.forEach((_, term) => df.set(term, (df.get(term) ?? 0) + 1));
  };

  const subtractDf = (tf: Map<string, number>) => {
    tf.forEach((_, term) => {
      const count = (df.get(term) ?? 0) - 1;
      if (count <= 0) df.delete(term);
      else df.set(term, count);
    });
  };

  const upsert = ({
    id,
    content,
    index = JSON.stringify(content),
    priority = Date.now(),
  }: {
    id: string;
    content: object;
    index?: string;
    priority?: number;
  }) => {
    const existing = docs.get(id);
    if (!USE_FULL_RECOMPUTE) {
      existing && subtractDf(existing.tf);
    }
    const tokens = tokenize(index);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    docs.set(id, { tf, len: tokens.length, content, priority });
    if (!USE_FULL_RECOMPUTE) {
      addDf(tf);
    }
    if (USE_FULL_RECOMPUTE) {
      recomputeDf();
    }
  };

  const read = (id: string): object | undefined => docs.get(id)?.content;

  const remove = (id: string) => {
    if (!USE_FULL_RECOMPUTE) {
      const existing = docs.get(id);
      existing && subtractDf(existing.tf);
    }
    docs.delete(id);
    if (USE_FULL_RECOMPUTE) {
      recomputeDf();
    }
  };

  const list = (): Array<{ id: string; content: object }> =>
    Array.from(docs.entries())
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([id, { content }]) => ({ id, content }));

  const search = (
    query: string,
    settings: SearchSettings = DEFAULT_SETTINGS,
  ): Array<{ id: string; score: number; content: object }> => {
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
              (freq * (settings.BM25_K1 + 1)) /
              (freq + settings.BM25_K1 * (1 - settings.BM25_B + (settings.BM25_B * doc.len) / avgLen));
            score += idf * tf;
          }
        }
        return { id, score, content: doc.content };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ id, content, score }) => ({ id, content, score }));
  };

  return { upsert, remove, list, search, read };
};

export default createSearchIndex;
