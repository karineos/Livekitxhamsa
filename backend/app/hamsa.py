import base64
import requests
from typing import Tuple
from .settings import settings

class Hamsa:
    def __init__(self):
        missing = []
        if not settings.HAMSA_API_KEY: missing.append("HAMSA_API_KEY")
        if not settings.HAMSA_STT_URL: missing.append("HAMSA_STT_URL")
        if not settings.HAMSA_TTS_URL: missing.append("HAMSA_TTS_URL")
        if not settings.HAMSA_LANGUAGE: missing.append("HAMSA_LANGUAGE")
        if not settings.HAMSA_DIALECT: missing.append("HAMSA_DIALECT")
        if not settings.HAMSA_SPEAKER: missing.append("HAMSA_SPEAKER")
        if missing:
            raise RuntimeError("Missing Hamsa env vars: " + ", ".join(missing))

        self.key = settings.HAMSA_API_KEY
        self.stt_url = settings.HAMSA_STT_URL
        self.tts_url = settings.HAMSA_TTS_URL
        self.language = settings.HAMSA_LANGUAGE
        self.dialect = settings.HAMSA_DIALECT
        self.speaker = settings.HAMSA_SPEAKER

    def stt(self, audio_bytes: bytes) -> str:
        headers = {
            "Authorization": f"Token {self.key}",
            "Content-Type": "application/json",
        }

        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        payload = {
            "audioBase64": audio_b64,
            "language": self.language,
            "isEosEnabled": True,
            "eosThreshold": 0.15,
        }



        r = requests.post(self.stt_url, headers=headers, json=payload, timeout=90)

        if r.status_code >= 400:
            raise RuntimeError(f"Hamsa STT error {r.status_code}: {r.text}")
        js = r.json()
        # Hamsa returns: {"success":true,"message":"success","data":{"text":"..."}}
        if isinstance(js, dict) and isinstance(js.get("data"), dict):
            return js["data"].get("text", "") or ""
        return js.get("text", "") or ""


    def tts(self, text: str) -> Tuple[bytes, str]:
        headers = {
            "Authorization": f"Token {self.key}",
            "Content-Type": "application/json",
        }

        payload = {
            "text": text,
            "speaker": self.speaker,
            "dialect": self.dialect,
            "mulaw": False,
        }

        r = requests.post(self.tts_url, headers=headers, json=payload, timeout=90)
        if r.status_code >= 400:
            raise RuntimeError(f"Hamsa TTS error {r.status_code}: {r.text}")

        ctype = r.headers.get("Content-Type", "audio/wav")
        return r.content, ctype


