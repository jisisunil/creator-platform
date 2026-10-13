/**
 * Turns text into vectors for future semantic search ("similar creators", AI-assisted
 * search, both "Later" in the spec). Interface only: nothing implements or calls it yet.
 *
 * Implementations must use an open-source model hosted on our own servers in India, such as
 * BGE-M3 behind Text Embeddings Inference (ADR-006). No hosted AI APIs, and no personal data
 * beyond public profile text (see buildCreatorProfileText).
 */
export interface EmbeddingProvider {
  /** Model name and version stored with each vector, e.g. "bge-m3" / "1". */
  readonly model: string;
  readonly version: string;
  /** Vector length; must match the CreatorEmbedding column (1024). */
  readonly dimensions: number;
  /** One vector per input text, in the same order. */
  embed(texts: readonly string[]): Promise<readonly number[][]>;
}
