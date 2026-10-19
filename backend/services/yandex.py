"""Yandex Music integration (unofficial API via the `yandex-music` package).

All tracks coming from here use ids of the form ``ym:<track_id>`` so they can live
in the same queue as local tracks without colliding with local (uuid) ids.
"""

import asyncio
import hashlib
import json
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Awaitable, Optional
from urllib.parse import urlparse

import httpx
from loguru import logger
from sqlalchemy import delete, select
from yandex_music import ClientAsync
from yandex_music.exceptions import NotFoundError, UnauthorizedError, YandexMusicError

from config import settings
from db.database import AsyncSessionLocal
from db.models import AppSetting

YM_PREFIX = "ym:"
TOKEN_KEY = "yandex_token"

# Cover / avatar hosts we are willing to fetch for palette extraction (SSRF guard)
_ALLOWED_IMAGE_HOSTS = ("avatars.yandex.net", "avatars.mds.yandex.net")

_STREAM_TTL = 90          # seconds a resolved direct link is reused
_LIKES_TTL = 120          # seconds the liked-ids set is considered fresh
_LYRICS_CACHE_SIZE = 200


class YandexNotAuthorized(Exception):
    """Raised when a call needs a signed-in Yandex account"""


class YandexNotFound(Exception):
    """Raised when the requested entity does not exist / is not available"""


# ── Serialization helpers ──


def _cover(uri: Optional[str], size: int = 400) -> Optional[str]:
    if not uri:
        return None
    url = uri.replace("%%", f"{size}x{size}")
    return url if url.startswith("http") else f"https://{url}"


def _names(artists) -> str:
    return ", ".join(a.name for a in (artists or []) if a and a.name)


def _pure_id(raw: Any) -> str:
    """'123:456' (track:album) -> '123'"""
    return str(raw).split(":")[0]


def track_dict(t, fallback_album=None, liked: Optional[set] = None) -> Optional[dict]:
    if t is None or getattr(t, "id", None) is None:
        return None
    tid = _pure_id(t.id)
    album = t.albums[0] if t.albums else fallback_album
    title = t.title or "Unknown"
    if getattr(t, "version", None):
        title = f"{title} ({t.version})"
    cover_uri = t.cover_uri or (album.cover_uri if album else None)
    return {
        "id": f"{YM_PREFIX}{tid}",
        "yandex_id": tid,
        "title": title,
        "artist": _names(t.artists) or "Unknown Artist",
        "artists": [{"id": str(a.id), "name": a.name} for a in (t.artists or []) if a and a.id],
        "album": album.title if album else None,
        "album_id": str(album.id) if album and album.id else None,
        "duration": (t.duration_ms or 0) / 1000,
        "artwork": _cover(cover_uri),
        "available": t.available is not False,
        "explicit": getattr(t, "content_warning", None) == "explicit",
        "has_lyrics": bool(getattr(t, "lyrics_available", False)),
        "liked": (tid in liked) if liked is not None else False,
        "source": "yandex",
    }


def album_dict(a) -> Optional[dict]:
    if a is None or a.id is None:
        return None
    first = a.artists[0] if a.artists else None
    return {
        "id": str(a.id),
        "title": a.title or "Unknown",
        "artist": _names(a.artists) or "Unknown Artist",
        "artist_id": str(first.id) if first and first.id else None,
        "year": a.year or a.original_release_year,
        "genre": a.genre,
        "track_count": a.track_count or 0,
        "artwork": _cover(a.cover_uri),
        "available": a.available is not False,
    }


def artist_dict(a) -> Optional[dict]:
    if a is None or a.id is None:
        return None
    counts = getattr(a, "counts", None)
    return {
        "id": str(a.id),
        "name": a.name or "Unknown",
        "artwork": _cover(a.cover.uri if a.cover else None) or _cover(a.og_image),
        "genres": a.genres or [],
        "track_count": getattr(counts, "tracks", None) if counts else None,
        "album_count": getattr(counts, "direct_albums", None) if counts else None,
    }


def playlist_dict(p) -> Optional[dict]:
    if p is None or p.kind is None:
        return None
    uid = p.uid or (p.owner.uid if p.owner else None)
    cover = p.cover
    cover_uri = None
    if cover:
        cover_uri = cover.uri or (cover.items_uri[0] if cover.items_uri else None)
    owner = None
    if p.owner:
        owner = p.owner.display_name or p.owner.name or p.owner.login
    return {
        "id": f"{uid}:{p.kind}",
        "uid": str(uid),
        "kind": str(p.kind),
        "title": p.title or "Playlist",
        "description": p.description,
        "owner": owner,
        "track_count": p.track_count or 0,
        "duration": (p.duration_ms or 0) / 1000,
        "artwork": _cover(cover_uri) or _cover(p.og_image),
    }


# ── Service ──


class YandexMusicService:
    def __init__(self):
        self._client: Optional[ClientAsync] = None
        self._http: Optional[httpx.AsyncClient] = None
        self._stream_cache: dict[str, tuple[str, float]] = {}
        self._lyrics_cache: "OrderedDict[str, dict]" = OrderedDict()
        self._liked: set[str] = set()
        self._liked_at = 0.0
        self._device: dict = {"state": "idle"}
        self._device_task: Optional[asyncio.Task] = None

    # ── Lifecycle / auth ──

    @property
    def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(
                timeout=httpx.Timeout(15.0, read=60.0), follow_redirects=True
            )
        return self._http

    async def startup(self):
        """Restore a saved token (if any). Never raises — the app must start offline."""
        try:
            async with AsyncSessionLocal() as db:
                row = (await db.execute(select(AppSetting).where(AppSetting.key == TOKEN_KEY))).scalar_one_or_none()
            if row:
                token = json.loads(row.value)
                if token:
                    await self._connect(token)
                    logger.info("✓ Yandex Music session restored")
        except Exception as e:
            logger.warning(f"Yandex Music session not restored: {e}")

    async def shutdown(self):
        if self._device_task and not self._device_task.done():
            self._device_task.cancel()
        if self._http:
            await self._http.aclose()
            self._http = None

    async def _connect(self, token: str):
        client = ClientAsync(token)
        await client.init()  # raises UnauthorizedError on a bad token
        self._client = client
        self._reset_caches()

    def _reset_caches(self):
        self._stream_cache.clear()
        self._lyrics_cache.clear()
        self._liked = set()
        self._liked_at = 0.0

    async def set_token(self, token: str):
        token = token.strip()
        if not token:
            raise YandexNotAuthorized()
        await self._connect(token)
        async with AsyncSessionLocal() as db:
            row = (await db.execute(select(AppSetting).where(AppSetting.key == TOKEN_KEY))).scalar_one_or_none()
            if row:
                row.value = json.dumps(token)
            else:
                db.add(AppSetting(key=TOKEN_KEY, value=json.dumps(token)))
            await db.commit()

    async def logout(self):
        self._client = None
        self._reset_caches()
        self._device = {"state": "idle"}
        if self._device_task and not self._device_task.done():
            self._device_task.cancel()
        async with AsyncSessionLocal() as db:
            await db.execute(delete(AppSetting).where(AppSetting.key == TOKEN_KEY))
            await db.commit()

    @property
    def authorized(self) -> bool:
        return self._client is not None

    def client(self) -> ClientAsync:
        if self._client is None:
            raise YandexNotAuthorized()
        return self._client

    def status(self) -> dict:
        me = self._client.me if self._client else None
        account = me.account if me else None
        return {
            "authorized": self.authorized,
            "uid": str(account.uid) if account and account.uid else None,
            "login": account.login if account else None,
            "display_name": (account.display_name or account.full_name or account.login) if account else None,
            "has_plus": bool(me and me.plus and me.plus.has_plus),
            "device_auth": self._device,
        }

    # ── Device (code) login ──

    async def start_device_auth(self) -> dict:
        if self._device_task and not self._device_task.done():
            self._device_task.cancel()
        tmp = ClientAsync()
        code = await tmp.request_device_code(device_name="No-one")
        self._device = {
            "state": "pending",
            "user_code": code.user_code,
            "verification_url": code.verification_url,
            "expires_in": code.expires_in,
        }
        self._device_task = asyncio.create_task(self._poll_device(tmp, code))
        return self._device

    async def _poll_device(self, tmp: ClientAsync, code):
        deadline = time.monotonic() + code.expires_in
        interval = max(code.interval or 5, 2)
        try:
            while time.monotonic() < deadline:
                await asyncio.sleep(interval)
                token = await tmp.poll_device_token(code.device_code)
                if token:
                    await self.set_token(token.access_token)
                    self._device = {"state": "ok"}
                    return
            self._device = {"state": "expired"}
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Yandex device auth failed: {e}")
            self._device = {"state": "error", "error": str(e)}

    # ── Likes bookkeeping ──

    async def liked_ids(self, force: bool = False) -> set[str]:
        if not self.authorized:
            return set()
        if force or time.monotonic() - self._liked_at > _LIKES_TTL:
            try:
                lst = await self.client().users_likes_tracks()
                self._liked = {_pure_id(t.id) for t in (lst.tracks if lst else [])}
                self._liked_at = time.monotonic()
            except UnauthorizedError:
                raise
            except YandexMusicError as e:
                logger.warning(f"Failed to refresh liked ids: {e}")
        return self._liked

    async def set_liked(self, track_id: str, liked: bool):
        c = self.client()
        if liked:
            await c.users_likes_tracks_add(track_id)
            self._liked.add(track_id)
        else:
            await c.users_likes_tracks_remove(track_id)
            self._liked.discard(track_id)

    async def _tracks(self, tracks, fallback_album=None) -> list[dict]:
        liked = await self.liked_ids()
        out = [track_dict(t, fallback_album, liked) for t in tracks]
        return [t for t in out if t]

    async def _hydrate(self, shorts) -> list:
        """TrackShort[] -> full Track[] (keeps order, one request per 100 tracks)"""
        ready: dict[str, Any] = {}
        missing: list[str] = []
        for s in shorts:
            if s.track:
                ready[_pure_id(s.id)] = s.track
            else:
                missing.append(f"{s.id}:{s.album_id}" if getattr(s, "album_id", None) else str(s.id))
        for i in range(0, len(missing), 100):
            for t in await self.client().tracks(missing[i:i + 100]):
                if t:
                    ready[_pure_id(t.id)] = t
        return [ready[_pure_id(s.id)] for s in shorts if _pure_id(s.id) in ready]

    # ── Catalog ──

    async def search(self, text: str, kind: str = "all", page: int = 0) -> dict:
        res = await self.client().search(text, type_=kind, page=page)
        liked = await self.liked_ids()

        def block(sr, fn):
            if not sr or not sr.results:
                return {"items": [], "total": 0}
            items = [fn(x) for x in sr.results]
            return {"items": [i for i in items if i], "total": sr.total or len(items)}

        return {
            "query": text,
            "type": kind,
            "page": page,
            "corrected": res.misspell_result if res and res.misspell_corrected else None,
            "tracks": block(res.tracks if res else None, lambda t: track_dict(t, None, liked)),
            "albums": block(res.albums if res else None, album_dict),
            "artists": block(res.artists if res else None, artist_dict),
            "playlists": block(res.playlists if res else None, playlist_dict),
        }

    async def suggest(self, part: str) -> list[str]:
        res = await self.client().search_suggest(part)
        return list(res.suggestions) if res and res.suggestions else []

    async def get_album(self, album_id: str) -> dict:
        album = await self._or_404(self.client().albums_with_tracks(album_id))
        tracks = [t for vol in (album.volumes or []) for t in vol]
        d = album_dict(album)
        d["tracks"] = await self._tracks(tracks, fallback_album=album)
        return d

    async def get_artist(self, artist_id: str) -> dict:
        info = await self._or_404(self.client().artists_brief_info(artist_id))
        if not info.artist:
            raise YandexNotFound()
        return {
            "artist": artist_dict(info.artist),
            "popular_tracks": await self._tracks(info.popular_tracks or []),
            "albums": [a for a in map(album_dict, info.albums or []) if a],
            "also_albums": [a for a in map(album_dict, info.also_albums or []) if a],
            "similar": [a for a in map(artist_dict, info.similar_artists or []) if a],
        }

    async def get_playlist(self, uid: str, kind: str) -> dict:
        p = await self._or_404(self.client().users_playlists(kind, uid))
        if isinstance(p, list):
            p = p[0] if p else None
        if not p:
            raise YandexNotFound()
        d = playlist_dict(p)
        d["tracks"] = await self._tracks(await self._hydrate(p.tracks or []))
        return d

    # ── User collection ──

    async def liked_tracks(self, offset: int = 0, limit: int = 100) -> dict:
        lst = await self.client().users_likes_tracks()
        shorts = sorted(lst.tracks if lst else [], key=lambda s: s.timestamp or "", reverse=True)
        page = shorts[offset:offset + limit]
        tracks = await self._tracks(await self._hydrate(page))
        for t in tracks:
            t["liked"] = True
        return {"tracks": tracks, "total": len(shorts), "offset": offset}

    async def liked_albums(self) -> list[dict]:
        likes = await self.client().users_likes_albums()
        return [a for a in (album_dict(l.album) for l in likes) if a]

    async def liked_artists(self) -> list[dict]:
        likes = await self.client().users_likes_artists()
        return [a for a in (artist_dict(l.artist) for l in likes) if a]

    async def liked_playlists(self) -> list[dict]:
        likes = await self.client().users_likes_playlists()
        return [p for p in (playlist_dict(l.playlist) for l in likes) if p]

    async def my_playlists(self) -> list[dict]:
        pls = await self.client().users_playlists_list()
        return [p for p in map(playlist_dict, pls or []) if p]

    # ── Home / browse ──

    async def browse(self) -> dict:
        c = self.client()
        errors: list[Exception] = []

        async def section(coro: Awaitable, default):
            try:
                return await coro
            except UnauthorizedError:
                raise
            except Exception as e:  # one broken section must not blank the whole page
                logger.warning(f"Yandex browse section failed: {e}")
                errors.append(e)
                return default

        async def chart():
            info = await c.chart()
            shorts = info.chart.tracks if info and info.chart else []
            tracks = await self._tracks(await self._hydrate(shorts))
            return tracks

        async def new_releases():
            lst = await c.new_releases()
            ids = (lst.new_releases if lst else [])[:30]
            return [a for a in map(album_dict, await c.albums(ids) if ids else []) if a]

        async def new_playlists():
            lst = await c.new_playlists()
            ids = [f"{p.uid}:{p.kind}" for p in (lst.new_playlists if lst else [])][:20]
            return [p for p in map(playlist_dict, await c.playlists_list(ids) if ids else []) if p]

        async def personal():
            landing = await c.landing(["personalplaylists"])
            out = []
            for block in (landing.blocks if landing else []):
                for ent in block.entities:
                    pl = getattr(ent.data, "data", None) if hasattr(ent.data, "ready") else ent.data
                    d = playlist_dict(pl)
                    if d:
                        out.append(d)
            return out

        charts, releases, playlists, mine = await asyncio.gather(
            section(chart(), []),
            section(new_releases(), []),
            section(new_playlists(), []),
            section(personal(), []),
        )
        if errors and not (charts or releases or playlists or mine):
            raise errors[0]
        return {"chart": charts, "new_releases": releases, "new_playlists": playlists, "personal": mine}

    async def _or_404(self, coro: Awaitable):
        try:
            res = await coro
        except NotFoundError:
            raise YandexNotFound()
        if res is None:
            raise YandexNotFound()
        return res

    # ── Playback ──

    async def get_stream_url(self, track_id: str, force: bool = False) -> str:
        cached = self._stream_cache.get(track_id)
        if cached and not force and cached[1] > time.monotonic():
            return cached[0]
        infos = await self._or_404(self.client().tracks_download_info(track_id))
        playable = [i for i in infos if i.codec == "mp3"] or list(infos)
        if not playable:
            raise YandexNotFound()
        best = max(playable, key=lambda i: i.bitrate_in_kbps or 0)
        url = await best.get_direct_link_async()
        self._stream_cache[track_id] = (url, time.monotonic() + _STREAM_TTL)
        return url

    async def get_lyrics(self, track_id: str) -> Optional[dict]:
        if track_id in self._lyrics_cache:
            self._lyrics_cache.move_to_end(track_id)
            return self._lyrics_cache[track_id] or None
        c = self.client()
        result = {"synced": "", "plain": ""}
        for fmt, key in (("LRC", "synced"), ("TEXT", "plain")):
            try:
                tl = await c.tracks_lyrics(track_id, fmt)
                if tl:
                    result[key] = await tl.fetch_lyrics_async()
            except UnauthorizedError:
                raise
            except NotFoundError:
                continue
            except YandexMusicError as e:
                logger.debug(f"Yandex lyrics ({fmt}) failed for {track_id}: {e}")
        found = result if (result["synced"] or result["plain"]) else {}
        self._lyrics_cache[track_id] = found
        while len(self._lyrics_cache) > _LYRICS_CACHE_SIZE:
            self._lyrics_cache.popitem(last=False)
        return found or None

    async def cover_palette(self, image_url: str) -> Optional[dict]:
        """Download a cover (cached on disk) and run the same palette extractor local tracks use"""
        host = urlparse(image_url).hostname or ""
        if urlparse(image_url).scheme != "https" or host not in _ALLOWED_IMAGE_HOSTS:
            raise YandexNotFound()
        from services.artwork import ArtworkExtractor

        path = Path(settings.artwork_cache_dir) / f"ym_{hashlib.sha1(image_url.encode()).hexdigest()}.jpg"
        if not path.exists():
            resp = await self.http.get(image_url)
            resp.raise_for_status()
            path.write_bytes(resp.content)
        return await asyncio.to_thread(ArtworkExtractor().generate_palette, str(path))


yandex_service = YandexMusicService()
