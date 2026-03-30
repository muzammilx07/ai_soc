import asyncio
import json

import websockets


async def test() -> None:
    out = {}

    # Valid connection
    uri_ok = "ws://127.0.0.1:8000/soc/ws/live?instance_id=default&api_key=dev-default-key"
    try:
        async with websockets.connect(uri_ok, open_timeout=5) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=5)
            out["valid_connect_message"] = json.loads(msg)
    except Exception as exc:
        out["valid_connect_error"] = repr(exc)

    # Invalid credentials should fail handshake/close
    uri_bad = "ws://127.0.0.1:8000/soc/ws/live?instance_id=default&api_key=bad"
    try:
        async with websockets.connect(uri_bad, open_timeout=5) as ws:
            await asyncio.wait_for(ws.recv(), timeout=2)
            out["invalid_connect_unexpected"] = "connected"
    except Exception as exc:
        out["invalid_connect_error"] = repr(exc)

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    asyncio.run(test())
