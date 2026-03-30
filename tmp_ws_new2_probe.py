import asyncio
import json
import websockets

uri = "ws://127.0.0.1:8000/soc/ws/live?instance_id=new-2&api_key=soc_uwzYuFdE1QXaCU49AmPabCG3"

async def main():
    try:
        async with websockets.connect(uri, open_timeout=8) as ws:
            first = await asyncio.wait_for(ws.recv(), timeout=8)
            print(json.dumps({"ok": True, "first_message": json.loads(first)}, indent=2))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": repr(exc)}, indent=2))

asyncio.run(main())
