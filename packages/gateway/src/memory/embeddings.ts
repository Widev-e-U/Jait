export type EmbeddingVector = Record<string, number>;

const TOKEN_RE = /[a-zA-Z0-9_]{2,}/g;

export function embedText(text: string): EmbeddingVector {
  const tokens = (text.toLowerCase().match(TOKEN_RE) ?? []);
  const vector: EmbeddingVector = {};
  for (const token of tokens) {
    vector[token] = (vector[token] ?? 0) + 1;
  }
  return vector;
}

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
