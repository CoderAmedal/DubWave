#!/usr/bin/env python3
"""本地 TTS helper：把 Edge TTS 包成 HTTP 服务，供浏览器扩展调用。

    python3 helper.py            # 监听 127.0.0.1:8758
    PORT=9000 python3 helper.py

接口：
    GET  /health            -> {"ok": true}
    GET  /voices            -> Edge 音色列表
    POST /tts {text, voice} -> audio/mpeg
"""
import asyncio
import json
import os
from collections import OrderedDict

import edge_tts
from aiohttp import web

PORT = int(os.environ.get("PORT", "8758"))
CACHE_SIZE = 256
_cache: "OrderedDict[str, bytes]" = OrderedDict()
_sem = asyncio.Semaphore(6)


@web.middleware
async def cors(request, handler):
    if request.method == "OPTIONS":
        resp = web.Response(status=204)
    else:
        resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


async def _synth(text: str, voice: str, rate: int = -5) -> bytes:
    key = f"{voice}|{rate}|{text}"
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    async with _sem:
        comm = edge_tts.Communicate(text, voice, rate=f"{rate:+d}%")
        buf = bytearray()
        async for chunk in comm.stream():
            if chunk.get("type") == "audio":
                buf.extend(chunk["data"])
    data = bytes(buf)
    if not data:
        raise RuntimeError("empty audio")
    _cache[key] = data
    if len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)
    return data


async def health(_req):
    return web.json_response({"ok": True})


async def voices(_req):
    try:
        vs = await edge_tts.list_voices()
    except Exception as e:  # noqa: BLE001
        return web.json_response({"error": str(e)}, status=502)
    return web.json_response(vs)


async def tts(req: web.Request):
    try:
        body = await req.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "invalid json"}, status=400)
    text = (body.get("text") or "").strip()
    voice = body.get("voice") or "zh-CN-XiaoxiaoNeural"
    try:
        rate = int(body.get("rate", -5))
    except (TypeError, ValueError):
        rate = -5
    rate = max(-40, min(60, rate))
    if not text:
        return web.json_response({"error": "empty text"}, status=400)
    if len(text) > 2000:
        text = text[:2000]
    try:
        audio = await _synth(text, voice, rate)
    except Exception as e:  # noqa: BLE001
        return web.json_response({"error": f"edge-tts failed: {e}"}, status=502)
    return web.Response(body=audio, content_type="audio/mpeg")


def make_app() -> web.Application:
    app = web.Application(middlewares=[cors])
    app.router.add_get("/health", health)
    app.router.add_get("/voices", voices)
    app.router.add_post("/tts", tts)
    return app


if __name__ == "__main__":
    print(f"yt-dub helper on http://127.0.0.1:{PORT}")
    web.run_app(make_app(), host="127.0.0.1", port=PORT, print=None)
