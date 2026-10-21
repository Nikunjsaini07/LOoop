"""Bounded-memory cosine neighbors for normalized transformer embeddings."""
import json
import sys
import numpy as np

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
vectors = np.asarray(payload["vectors"], dtype=np.float32)
anchors = np.asarray(payload["anchors"], dtype=np.float32)
neighbors, topics = [], []
if len(vectors):
    for start in range(0, len(vectors), 128):
        scores = vectors[start:start + 128] @ vectors.T
        for offset, row in enumerate(scores):
            index = start + offset
            row[index] = -1
            count = min(24, max(0, len(row) - 1))
            candidates = np.argpartition(-row, count - 1)[:count] if count else []
            selected = sorted((int(i) for i in candidates if row[i] >= 0.45), key=lambda i: (-float(row[i]), i))
            neighbors.append([[i, round(min(1.0, max(-1.0, float(row[i]))), 6)] for i in selected])
        print(f"Matched {min(start + 128, len(vectors))}/{len(vectors)} articles", file=sys.stderr) if start % 1024 == 0 else None
    affinities = vectors @ anchors.T
    for row in affinities:
        best = np.argsort(-row)[:3]
        topics.append([[int(i), round(float(row[i]), 6)] for i in best if row[i] >= 0.3])
with open(sys.argv[2], "w", encoding="utf-8") as handle:
    json.dump({"neighbors": neighbors, "topics": topics}, handle)
