# ADR-006: AI features use open-source models we host ourselves

**Status:** accepted · 2026-10-13

## Context

AI features ("similar creators", AI-assisted search) are "Later" items in the spec; the MVP
builds none of them. The owner asked that AI use open-source models with no licence cost.
CLAUDE.md §8 also forbids sending personal data to third-party services the spec doesn't list,
and PR-12 keeps data in India.

## Decision

- Only open-weight models with permissive licences (MIT, Apache-2.0 or similar), run on our
  own servers in the India region. No calls to hosted AI APIs.
- **Embeddings:** BGE-M3 (MIT, multilingual including Hindi and other Indian languages, 1024
  dimensions) is the first choice; multilingual-E5-large (MIT, 1024 dimensions) is the
  fallback. Both match the `vector(1024)` column and HNSW index already in `CreatorEmbedding`.
- **Serving:** Hugging Face Text Embeddings Inference (Apache-2.0) or Ollama, as a container
  behind the `EmbeddingProvider` interface in `src/adapters/ai/`.
- **Input:** `buildCreatorProfileText` (domain) builds embedding text from public profile
  fields only, never contact details or private data.
- A generative model, if ever needed, follows the same rule (open weights, self-hosted).

## Consequences

- No per-call fees and no personal data leaves our infrastructure.
- The models are free but need compute: embedding ~50k profiles is fine on CPU; generative
  models would need a GPU instance, to be sized in phase i when a feature is scheduled.
- Changing the embedding model or its dimension needs a migration and a full re-embed; the
  `model` and `version` columns record which model produced each vector.
