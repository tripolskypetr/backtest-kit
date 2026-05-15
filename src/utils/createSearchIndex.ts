const DEFAULT_BM25_K1 = 1.5;
const DEFAULT_BM25_B = 0.75;
const DEFAULT_BM25_SCORE = 0.5;

const USE_FULL_RECOMPUTE = false;

/**
 * Tuning parameters for BM25 full-text search scoring.
 * Controls term frequency saturation, document length normalization, and minimum score threshold.
 */
export type SearchSettings = {
  /**
   * Term frequency saturation parameter.
   * Higher values give more weight to repeated terms; lower values saturate faster.
   * Typical range: 1.2–2.0. Default: 1.5.
   */
  BM25_K1: number;
  /**
   * Document length normalization factor.
   * 0 = no normalization, 1 = full normalization by average document length.
   * Default: 0.75.
   */
  BM25_B: number;
  /**
   * Minimum BM25 score threshold for a result to be included in the output.
   * Results with score below this value are filtered out.
   * Default: 0.5.
   */
  BM25_SCORE: number;
}

const DEFAULT_SETTINGS: SearchSettings = {
  BM25_K1: DEFAULT_BM25_K1,
  BM25_B: DEFAULT_BM25_B,
  BM25_SCORE: DEFAULT_BM25_SCORE,
}

const normalize = (s: string): string =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
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
    { tf: Map<string, number>; len: number; content: object; priority: number; when: number }
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
    when,
    index = JSON.stringify(content),
    priority = Date.now(),
  }: {
    id: string;
    content: object;
    when: number;
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
    docs.set(id, { tf, len: tokens.length, content, priority, when });
    if (!USE_FULL_RECOMPUTE) {
      addDf(tf);
    }
    if (USE_FULL_RECOMPUTE) {
      recomputeDf();
    }
  };

  /**
   * Read a document by id. Returns undefined when the document was written
   * with a `when` greater than the requested `when` (look-ahead guard).
   */
  const read = (id: string, when: number): object | undefined => {
    const doc = docs.get(id);
    if (!doc || doc.when > when) return undefined;
    return doc.content;
  };

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

  /**
   * List documents whose `when` is less than or equal to the requested `when`
   * (look-ahead guard), sorted by priority.
   */
  const list = (when: number): Array<{ id: string; content: object }> =>
    Array.from(docs.entries())
      .filter(([, doc]) => doc.when <= when)
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([id, { content }]) => ({ id, content }));

  /**
   * BM25 search over documents whose `when` is less than or equal to the
   * requested `when` (look-ahead guard).
   *
   * Document frequency (df) is computed across the whole index — the time-cut
   * is applied only to the candidate set, so scores stay comparable across
   * different `when` values.
   */
  const search = (
    query: string,
    when: number,
    settings: SearchSettings = DEFAULT_SETTINGS,
  ): Array<{ id: string; score: number; content: object }> => {
    const terms = tokenize(query);
    if (!terms.length || !docs.size) return [];

    const N = docs.size;
    const avgLen = [...docs.values()].reduce((s, d) => s + d.len, 0) / N;

    return [...docs.entries()]
      .filter(([, doc]) => doc.when <= when)
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
      .filter((r) => r.score >= settings.BM25_SCORE)
      .sort((a, b) => b.score - a.score)
      .map(({ id, content, score }) => ({ id, content, score }));
  };

  return { upsert, remove, list, search, read };
};

export default createSearchIndex;
