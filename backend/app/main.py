from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from dotenv import load_dotenv
from typing import Optional
from .settings import settings
from .livekit_tokens import mint_token
from .qdrant_rag import retrieve
from .azure_llm import chat
from .hamsa import Hamsa
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from fastapi.responses import Response, JSONResponse

load_dotenv()

app = FastAPI()

# Allow your UI to call backend without changing UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev, lock down later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {
        "ok": True,
        "livekit_url": settings.LIVEKIT_URL,
        "qdrant": settings.QDRANT_URL,
    }

@app.get("/api/token")
def token(
    room: str = Query(default=settings.DEFAULT_ROOM),
    identity: str = Query(default="web-user"),
    name: Optional[str] = Query(default=None),
):
    try:
        if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
            return JSONResponse(
                status_code=500,
                content={
                    "error": "LIVEKIT_API_KEY/SECRET not loaded from backend/.env",
                    "LIVEKIT_API_KEY": settings.LIVEKIT_API_KEY,
                    "LIVEKIT_API_SECRET_set": bool(settings.LIVEKIT_API_SECRET),
                },
            )

        jwt = mint_token(room, identity, name=name)
        return {
            "token": jwt,
            "livekitUrl": settings.LIVEKIT_URL,
            "room": room,
            "identity": identity,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
class ChatRequest(BaseModel):
    message: str
    use_rag: bool = True
    top_k: int = 5
class TTSRequest(BaseModel):
    text: str

@app.post("/api/chat")
def chat_api(body: ChatRequest):
    try:
        system = "You are a helpful Arabic Saudi assistant. Be clear and concise."

        context = ""
        sources = []
        if body.use_rag:
            context, items = retrieve(body.message, top_k=body.top_k)
            sources = items

        answer = chat(system=system, user=body.message, context=context)
        return {"answer": answer, "context": context, "sources": sources}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/stt")
async def stt(audio: UploadFile = File(...)):
    try:
        data = await audio.read()
        print("UPLOAD filename:", audio.filename, "bytes:", len(data))

        h = Hamsa()
        text = h.stt(data)
        return {"text": text}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/tts")
def tts(body: TTSRequest):
    try:
        h = Hamsa()
        audio_bytes, content_type = h.tts(body.text)
        return Response(content=audio_bytes, media_type=content_type)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
