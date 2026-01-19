from openai import AzureOpenAI
from .settings import settings

def _client() -> AzureOpenAI:
    if not settings.AZURE_OPENAI_ENDPOINT or not settings.AZURE_OPENAI_API_KEY:
        raise RuntimeError("Missing AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY")
    return AzureOpenAI(
        azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_API_KEY,
        api_version=settings.AZURE_OPENAI_API_VERSION,
    )

def embed(texts: list[str]) -> list[list[float]]:
    if not settings.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT:
        raise RuntimeError("Missing AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT")
    client = _client()
    resp = client.embeddings.create(
        model=settings.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT,
        input=texts,
    )
    return [d.embedding for d in resp.data]

def chat(system: str, user: str, context: str = "") -> str:
    if not settings.AZURE_OPENAI_DEPLOYMENT:
        raise RuntimeError("Missing AZURE_OPENAI_DEPLOYMENT")
    client = _client()

    messages = [{"role": "system", "content": system}]
    if context.strip():
        messages.append({"role": "system", "content": f"Use this context if relevant:\n{context}"})
    messages.append({"role": "user", "content": user})

    resp = client.chat.completions.create(
        model=settings.AZURE_OPENAI_DEPLOYMENT,
        messages=messages,
        temperature=0.3,
    )
    return resp.choices[0].message.content or ""
