export type EmbeddingVector = Record<string, number>;
export declare function embedText(text: string): EmbeddingVector;
export declare function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number;
//# sourceMappingURL=embeddings.d.ts.map