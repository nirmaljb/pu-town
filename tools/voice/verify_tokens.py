"""Prove initial/refreshed browser grants cannot bypass the gateway; no browsers."""
import asyncio
import base64
import json
import os
from urllib.parse import urlencode
import websockets
from livekit import api
from livekit.protocol import rtc as signal
from verify import Player, GAME

async def denied(url, expected):
    try:
        async with websockets.connect(url):
            raise AssertionError("Unauthorized signaling connection succeeded")
    except websockets.exceptions.InvalidStatus as error:
        assert error.response.status_code == expected, str(error)

async def main():
    player = await Player().connect()
    try:
        await player.send("create_room", displayName="Token proof")
        await player.wait("room_snapshot")
        await player.send("start_practice")
        await player.wait("game_state")
        for phase in ("day", "night"):
            await player.send("advance_practice", round=1, phase=phase)
            await player.wait("game_state", lambda e: e["phase"] != phase)
        await player.send("join_voice", round=1)
        grant = await player.wait("voice_state")
        token = grant["token"]
        claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "==="))
        public = GAME.removesuffix("/ws/game") + "/voice/rtc"
        media = os.environ["PUTOWN_VOICE_SERVER"].replace("http", "ws", 1) + "/rtc"
        options = dict(protocol=16, sdk="python", version="1.1.20", auto_subscribe=1)
        await denied(media + "?" + urlencode(dict(options, access_token=token)), 401)
        async with websockets.connect(public + "?" + urlencode(dict(options, access_token=token)),
                                      origin="http://localhost:5173") as connection:
            first = signal.SignalResponse.FromString(await connection.recv())
            assert first.WhichOneof("message") == "join"
            await asyncio.sleep(1.1)
            async with api.LiveKitAPI(os.environ["PUTOWN_VOICE_SERVER"], os.environ["PUTOWN_VOICE_KEY"],
                                     os.environ["PUTOWN_VOICE_SECRET"]) as service:
                await service.room.update_participant(api.UpdateParticipantRequest(
                    room=claims["video"]["room"], identity=claims["sub"], name="Refresh proof"))
            async def refreshed():
                while True:
                    response = signal.SignalResponse.FromString(await connection.recv())
                    if response.WhichOneof("message") == "refresh_token" and response.refresh_token != token: return response.refresh_token
            refreshed_token = await asyncio.wait_for(refreshed(), 10)
            assert refreshed_token != token
            await denied(media + "?" + urlencode(dict(options, access_token=refreshed_token)), 401)
        # The rewritten token is useful for gateway reconnect, not merely corrupted.
        async with websockets.connect(public + "?" + urlencode(dict(options, access_token=refreshed_token)),
                                      origin="http://localhost:5173") as connection:
            first = signal.SignalResponse.FromString(await connection.recv())
            assert first.WhichOneof("message") == "join"
        await player.send("leave_voice")
        await player.wait("voice_state", lambda e: e["token"] is None)
        await denied(public + "?" + urlencode(dict(options, access_token=refreshed_token)), 403)
        print("PASS: initial and refreshed credentials deny direct SFU access; refreshed grant reconnects only through gateway and is revoked on Leave voice")
    finally:
        await player.socket.close()

if __name__ == "__main__":
    asyncio.run(main())
