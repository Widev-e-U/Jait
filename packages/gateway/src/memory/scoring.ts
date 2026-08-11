/**
 * Okapi BM25 ranking over an in-process document set.
 *
 * The memory corpus is small enough (hundreds of entries per scope) that ranking
 * in JS beats an FTS5 index: term statistics are computed over the *scope-filtered*
 * corpus, so IDF reflects the documents actually being searched, and there is no
 * trigger-synced shadow table to drift out of date.
 */

/** Term-frequency saturation. Higher = repeated terms keep adding weight. */
const K1 = 1.2;
/** Length normalization strength. 0 = ignore length, 1 = fully normalize. */
const B = 0.75;

export interface Bm25Document<T> {
  item: T;
  text: string;
}

export interface Bm25Result<T> {
  item: T;
  score: number;
}

/**
 * Grammatical function words carry no retrieval intent, and IDF cannot learn that here:
 * memories are one-line facts, so a word like "this" lands in only a handful of them and
 * IDF rates it *rare*. Without this list a conversational query ("what does X do in this
 * app") ranks memories that share nothing but "this" and "in" above the real match.
 */
const STOP_WORDS = new Set([
  "a", "about", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can",
  "could", "did", "do", "does", "for", "from", "get", "had", "has", "have", "he", "her",
  "him", "his", "how", "if", "in", "into", "is", "it", "its", "just", "me", "my", "no",
  "not", "now", "of", "on", "or", "our", "out", "she", "should", "so", "some", "than",
  "that", "the", "their", "them", "then", "there", "these", "they", "this", "those", "to",
  "up", "us", "was", "we", "were", "what", "when", "where", "which", "while", "who", "why",
  "will", "with", "would", "you", "your",
]);

/**
 * Splits text into comparable terms. Trailing plurals are folded so a query for
 * "icon" matches a memory about "icons".
 */
export function bm25Tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    .map((token) => token.replace(/s$/, ""))
    .filter((token) => token.length >= 2);
}

/**
 * Rare terms outweigh common ones. A term present in every document scores ~0,
 * which is what makes BM25 self-tuning where a hand-maintained stopword list is not.
 */
function inverseDocumentFrequency(documentCount: number, matchingDocuments: number): number {
  return Math.log(1 + (documentCount - matchingDocuments + 0.5) / (matchingDocuments + 0.5));
}

/**
 * Scores every document against the query. Documents sharing no query term score 0
 * and are still returned, so callers can apply their own cutoff.
 */
export function bm25Rank<T>(query: string, documents: Bm25Document<T>[]): Bm25Result<T>[] {
  const queryTerms = [...new Set(bm25Tokens(query))];
  if (queryTerms.length === 0 || documents.length === 0) {
    return documents.map((document) => ({ item: document.item, score: 0 }));
  }

  const termFrequencies: Map<string, number>[] = [];
  const documentFrequency = new Map<string, number>();
  let totalLength = 0;

  for (const document of documents) {
    const tokens = bm25Tokens(document.text);
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    for (const token of frequencies.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
    termFrequencies.push(frequencies);
    totalLength += tokens.length;
  }

  const averageLength = totalLength / documents.length || 1;

  return documents.map((document, index) => {
    const frequencies = termFrequencies[index]!;
    const length = [...frequencies.values()].reduce((sum, count) => sum + count, 0);
    let score = 0;

    for (const term of queryTerms) {
      const termFrequency = frequencies.get(term) ?? 0;
      if (termFrequency === 0) continue;
      const idf = inverseDocumentFrequency(documents.length, documentFrequency.get(term) ?? 0);
      const saturated = (termFrequency * (K1 + 1))
        / (termFrequency + K1 * (1 - B + (B * length) / averageLength));
      score += idf * saturated;
    }

    return { item: document.item, score };
  });
}
