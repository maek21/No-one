"""Yandex Music API endpoints (online mode)"""

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from loguru import logger
from pydantic import BaseModel
from yandex_music.exceptions import (
    DeviceAuthError,
    NetworkError,
    NotFoundError,
    TimedOutError,
    UnauthorizedError,
    YandexMusicError,
)

from services.yandex import YandexNotAuthorized, YandexNotFound, yandex_service as ym

router = APIRouter()


# ── Error mapping ──


def register_error_handlers(app: FastAPI):
    """Translate Yandex errors into JSON the frontend can branch on via `code`"""

    def reply(status: int, code: str, detail: str):
        return JSONResponse(status_code=status, content={"detail": detail, "code": code})

    @app.exception_handler(YandexNotAuthorized)
    @app.exception_handler(UnauthorizedError)
    async def _unauthorized(_: Request, exc: Exception):
        return reply(401, "not_authorized", "Sign in to Yandex Music first")

    @app.exception_handler(YandexNotFound)
    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: Exception):
        return reply(404, "not_found", "Not found on Yandex Music")

    @app.exception_handler(TimedOutError)
    async def _timeout(_: Request, exc: Exception):
        return reply(504, "timeout", "Yandex Music timed out")

    @app.exception_handler(YandexMusicError)
    async def _upstream(_: Request, exc: Exception):
        if isinstance(exc, NetworkError) and "(451)" in str(exc):
            return reply(451, "region_blocked", "Yandex Music is not available from your network/region")
        if isinstance(exc, DeviceAuthError):
            return reply(400, "auth_failed", str(exc))
        logger.warning(f"Yandex Music error: {exc}")
        return reply(502, "upstream_error", str(exc) or "Yandex Music request failed")


# ── Auth ──


class TokenRequest(BaseModel):
    token: str


@router.get("/status")
async def status():
    return ym.status()


@router.post("/auth/token")
async def login_with_token(request: TokenRequest):
    """Sign in with a pasted OAuth token"""
    await ym.set_token(request.token)
    return ym.status()


@router.post("/auth/device")
async def login_with_device_code():
    """Start the OAuth device flow: returns a code + URL for the user to confirm in a browser"""
    return await ym.start_device_auth()


@router.post("/auth/logout")
async def logout():
    await ym.logout()
    return ym.status()


# ── Catalog ──


@router.get("/search")
async def search(q: str = Query(min_length=1), type: str = "all", page: int = 0):
    if type not in ("all", "track", "album", "artist", "playlist"):
        raise HTTPException(status_code=400, detail="Unknown search type")
    return await ym.search(q, type, page)


@router.get("/search/suggest")
async def suggest(q: str = Query(min_length=1)):
    return {"suggestions": await ym.suggest(q)}


@router.get("/browse")
async def browse():
    return await ym.browse()


@router.get("/albums/{album_id}")
async def album(album_id: str):
    return await ym.get_album(album_id)


@router.get("/artists/{artist_id}")
async def artist(artist_id: str):
    return await ym.get_artist(artist_id)


@router.get("/playlists/{uid}/{kind}")
async def playlist(uid: str, kind: str):
    return await ym.get_playlist(uid, kind)


# ── User collection ──


@router.get("/collection/tracks")
async def collection_tracks(offset: int = 0, limit: int = Query(100, le=200)):
    return await ym.liked_tracks(offset, limit)


@router.get("/collection/albums")
async def collection_albums():
    return await ym.liked_albums()


@router.get("/collection/artists")
async def collection_artists():
    return await ym.liked_artists()


@router.get("/collection/playlists")
async def collection_playlists():
    """User's own playlists plus the ones they liked"""
    mine = await ym.my_playlists()
    seen = {p["id"] for p in mine}
    return mine + [p for p in await ym.liked_playlists() if p["id"] not in seen]


@router.put("/tracks/{track_id}/like")
async def like_track(track_id: str):
    await ym.set_liked(track_id, True)
    return {"liked": True}


@router.delete("/tracks/{track_id}/like")
async def unlike_track(track_id: str):
    await ym.set_liked(track_id, False)
    return {"liked": False}


# ── Per-track data ──


@router.get("/tracks/{track_id}/lyrics")
async def lyrics(track_id: str):
    result = await ym.get_lyrics(track_id)
    if not result:
        raise HTTPException(status_code=404, detail="Lyrics not found")
    return result


@router.get("/palette")
async def palette(url: str):
    result = await ym.cover_palette(url)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to extract palette")
    return result


_PASSTHROUGH = ("content-length", "content-range", "accept-ranges", "content-type")


@router.api_route("/stream/{track_id}", methods=["GET", "HEAD"])
async def stream(track_id: str, request: Request):
    """Proxy the audio through the backend.

    The frontend feeds the <audio> element into a Web Audio analyser for visualisations,
    which outputs silence for cross-origin media without CORS headers — so we can't just
    hand the browser Yandex's direct link. Range requests are forwarded so seeking works.
    """
    headers = {}
    if request.headers.get("range"):
        headers["Range"] = request.headers["range"]

    upstream = None
    for attempt in (0, 1):
        url = await ym.get_stream_url(track_id, force=attempt == 1)
        req = ym.http.build_request("GET", url, headers=headers)
        upstream = await ym.http.send(req, stream=True)
        if upstream.status_code in (403, 410) and attempt == 0:
            await upstream.aclose()  # expired link — resolve a fresh one and retry once
            continue
        break

    if upstream.status_code >= 400:
        await upstream.aclose()
        raise HTTPException(status_code=502, detail=f"Yandex CDN returned {upstream.status_code}")

    out_headers = {k: upstream.headers[k] for k in _PASSTHROUGH if k in upstream.headers}
    out_headers.setdefault("accept-ranges", "bytes")
    media_type = out_headers.pop("content-type", "audio/mpeg")

    if request.method == "HEAD":
        await upstream.aclose()
        return Response(status_code=upstream.status_code, headers=out_headers, media_type=media_type)

    async def body():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()

    return StreamingResponse(
        body(), status_code=upstream.status_code, headers=out_headers, media_type=media_type
    )
