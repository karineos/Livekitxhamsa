from typing import Optional
from livekit import api
from .settings import settings

def mint_token(room: str, identity: str, name: Optional[str] = None) -> str:
    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise RuntimeError("Missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET")

    token = api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)

    # livekit-api 1.1.0 uses fluent setters (no add_grant)
    token = token.with_identity(identity)

    if name:
        token = token.with_name(name)

    grants = api.VideoGrants(room_join=True, room=room)
    token = token.with_grants(grants)

    return token.to_jwt()
