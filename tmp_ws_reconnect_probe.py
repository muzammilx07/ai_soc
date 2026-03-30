import asyncio
import json
import requests
import websockets

BASE = "http://127.0.0.1:8000"
inst = requests.get(f"{BASE}/instances", timeout=10).json()[0]
iid = inst["instance_id"]
key = inst["api_key"]
headers = {"x-instance-id": iid, "x-api-key": key}

async def main():
    uri = f"ws://127.0.0.1:8000/soc/ws/live?instance_id={iid}&api_key={key}"
    async with websockets.connect(uri, open_timeout=5) as ws:
        first = await asyncio.wait_for(ws.recv(), timeout=5)
        sim = requests.post(f"{BASE}/logs/simulate", json={"count": 1}, headers=headers, timeout=10)
        second = await asyncio.wait_for(ws.recv(), timeout=8)
        print(json.dumps({
            "connect_msg": json.loads(first),
            "simulate_status": sim.status_code,
            "simulate_body": sim.json(),
            "update_msg": json.loads(second)
        }, indent=2))

asyncio.run(main())
