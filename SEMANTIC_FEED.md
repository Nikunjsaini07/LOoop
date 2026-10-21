# Recent and rediscovered reading

The personal feed mixes recent collected writing with older, semantically relevant articles. Latest and Following remain chronological, and Trending still uses real community activity.

An available five-story group contains three recent stories, one historical match and one discovery. Recent means published in the last 30 days; an undated article uses its collection date and keeps its existing “Collected” label. Historical slots require a known publication date at least 180 days old and a semantic match of at least 0.42. Missing lanes simply leave space for the available candidates: no fabricated dates, invented classics, repeated stories or quota padding. Read articles follow unread articles. Company, topic, search and exclusion constraints apply before mixing.

## Semantic data flow

`scripts/semantic-index.mjs` runs pinned, quantized `Xenova/all-MiniLM-L6-v2` locally using Hugging Face Transformers.js. It mean-pools and normalizes 384-dimensional vectors from publisher titles and collected excerpts. Article bodies and account profiles are not sent to an embedding API. First run downloads public model files into ignored `outputs/semantic/models/`; subsequent inference uses the cache. Model identity includes its immutable revision, quantization and pooling settings.

The script caches vectors by model/content hash, embeds only new or changed text, computes cosine neighbors in bounded NumPy blocks, and writes only changed documents/neighborhoods through Wrangler. A vector is never computed in a page request. Each document retains up to 24 neighbors above 0.45 and up to three topic-anchor affinities above 0.30. Topic anchors use the SQL catalog's names and aliases; these are semantic affinities, not new hard-filter tags. Full similarity matching is quadratic in archive size, so very large archives should replace this offline step with an approximate nearest-neighbor index; the request contract can stay unchanged.

Feed SQL joins these stored matches against explicit interests and up to 64 saved/read/useful seed articles. With no personal history it uses the technical topic anchors as discovery evidence. Explanations identify the actual matched topic or saved/read article. An archive label describes age, never claims that a piece is timeless, correct today, peer reviewed or foundational. Titles and short excerpts limit semantic understanding, particularly when the publisher supplied no excerpt.

Semantic documents carry their exact input text and model version. Topic affinities record the source version; neighbor edges record both endpoint versions. Queries reject stale text, wrong models and partially refreshed graph generations. Existing feed editions freeze IDs, lanes and recommendation reasons for one hour; completing an index refresh increments `semantic_revision` for new editions. Public article and research entries already in the archive participate equally; this does not add a separate external paper catalog or fetch full papers.

## Run locally

Requires the project's locked Node dependencies and Python with NumPy. This checkout already has NumPy. For another environment, install `numpy>=1.26,<3` in its Python environment.

```powershell
npm run semantic:index
npm run semantic:status
node scripts/verify-semantic.mjs
npm run dev
```

The indexer applies additive migrations `0004_semantic_feed.sql` and `0005_semantic_generation.sql` once, tracked in `readzz_migrations`. It preserves article IDs, profiles, bookmarks, read logs and engagement. Vector and graph checkpoints survive interruptions. Imports retry temporary local SQLite locks. One indexer per database is enforced with a process lock.

Portable `npm run dev` starts a background watcher automatically. It checks for changed public metadata every minute, skips unchanged indexes, and stops with its owning development process. `npm run semantic:watch` also runs it independently. Fresh articles can enter recent slots immediately while their embeddings are pending. Reading works without downloaded model files; the historical quota activates only where genuine stored matches exist.

## Hosted operation

The production Worker consumes the same D1 tables; it does not load the Node/ONNX inference runtime. For a hosted rollout, apply the migrations/index through `node scripts/semantic-index.mjs --remote` and schedule that command on a Node/Python worker with D1 credentials after ingestion. This local implementation does not create or deploy that external schedule. The existing Cloudflare ingestion Worker continues collecting articles; running it alone does not produce embeddings. Remote watch mode is deliberately unavailable to avoid an accidental continuous remote administrative job.

## Feedback and verification

“Useful” adds a private positive semantic seed. “Less like this” hides that exact article in future personal editions and reduces close neighbors; it never hides entries from an explicit saved-ID lookup. Tapping the selected action again undoes it. Feedback is bounded to 500 unique article ratings and uses the existing account-owned, version-checked profile persistence. It creates no public popularity vote or activity-calendar event. Controls update immediately; the visible edition changes only on Refresh, filters or account changes.

Tests cover recent/history mixing, semantic matches without keyword overlap, cold starts, missing dates, immediate unindexed arrivals, strict filters, stale content/generations, duplicate-free pagination, frozen reasons, private feedback, undo, sign-in gating and preference snapshots. The model smoke test separately verifies that conceptually related sentences score above an unrelated sentence using the real downloaded model.

Model and runtime references: [MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [pinned ONNX conversion](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/751bff37182d3f1213fa05d7196b954e230abad9), [normalized embedding similarity](https://sbert.net/docs/sentence_transformer/usage/semantic_textual_similarity.html).
