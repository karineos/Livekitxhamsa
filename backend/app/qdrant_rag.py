from qdrant_client import QdrantClient
from qdrant_client.http import models as qm
from .settings import settings
from .azure_llm import embed

def _client() -> QdrantClient:
    return QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY or None
    )

def ensure_collection(vector_size: int):
    qc = _client()
    existing = [c.name for c in qc.get_collections().collections]
    if settings.QDRANT_COLLECTION not in existing:
        qc.create_collection(
            collection_name=settings.QDRANT_COLLECTION,
            vectors_config=qm.VectorParams(size=vector_size, distance=qm.Distance.COSINE),
        )

def retrieve(query: str, top_k: int = 5) -> tuple[str, list[dict]]:
    qvec = embed([query])[0]
    ensure_collection(vector_size=len(qvec))

    qc = _client()
    hits = qc.search(
        collection_name=settings.QDRANT_COLLECTION,
        query_vector=qvec,
        limit=top_k,
        with_payload=True,
    )

    context_chunks = []
    items = []
    for h in hits:
        payload = h.payload or {}
        text = payload.get("text") or payload.get("chunk") or payload.get("content") or ""
        source = payload.get("source") or payload.get("doc") or payload.get("url") or ""
        score = float(h.score) if h.score is not None else None

        if text:
            context_chunks.append(f"{text}\n(source: {source})".strip())
        items.append({"score": score, "source": source, "text": text})

    return ("\n\n---\n\n".join(context_chunks), items)
