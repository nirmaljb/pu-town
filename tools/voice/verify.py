"""Real Game + SFU acceptance through independent native clients, without browsers.
Run against a configured backend and loopback-only LiveKit. Takes about six minutes.
"""
import asyncio
import json
import os
from urllib.parse import urlsplit, urlunsplit
import numpy as np
import websockets
from livekit import rtc
from livekit.protocol import rtc as signal, models
from urllib.parse import urlencode

GAME = os.getenv("PUTOWN_TEST_WS", "ws://localhost:18086/ws/game")

class Player:
    async def connect(self):
        self.socket = await websockets.connect(GAME, origin="http://localhost:5173")
        self.events = asyncio.Queue()
        self.latest = {}
        self.reader = asyncio.create_task(self.read())
        return self

    async def read(self):
        async for payload in self.socket:
            event = json.loads(payload)
            self.latest[event["type"]] = event
            await self.events.put(event)

    async def send(self, kind, **fields):
        await self.socket.send(json.dumps(dict(version=1, type=kind, **fields)))

    async def wait(self, kind, predicate=lambda e: True, timeout=240):
        async def receive():
            while True:
                event = await self.events.get()
                if event["type"] == kind and predicate(event):
                    return event
        return await asyncio.wait_for(receive(), timeout)

    async def voice(self):
        await self.send("join_voice", round=1)
        event = await self.wait("voice_state")
        parts = urlsplit(GAME)
        url = urlunsplit((parts.scheme, parts.netloc, event["url"], "", ""))
        room = rtc.Room()
        await asyncio.wait_for(room.connect(url, event["token"]), 20)
        return room, url, event["token"]

async def main():
    players = [await Player().connect() for _ in range(4)]
    media = []
    tone = None
    try:
        await players[0].send("create_room", displayName="Voice proof 0")
        snapshot = await players[0].wait("room_snapshot")
        for i, player in enumerate(players[1:], 1):
            await player.send("join_room", roomId=snapshot["roomId"], displayName=f"Voice proof {i}")
            await player.wait("room_snapshot")
        for player in players:
            await player.send("set_ready", ready=True)
        await players[0].wait("room_state", lambda e: all(p["ready"] for p in e["players"]))
        await players[0].send("start_game")
        await players[0].wait("game_state")
        await players[0].send("join_voice", round=1)
        assert (await players[0].wait("error"))["code"] == "invalid_phase"
        print("PASS: voice admission denied outside Townhall; waiting for real deadlines", flush=True)
        await players[0].wait("game_state", lambda e: e["phase"] == "night")
        await players[0].send("join_voice", round=1)
        assert (await players[0].wait("error"))["code"] == "invalid_phase"
        print("PASS: Night refuses voice admission", flush=True)
        await players[0].wait("game_state", lambda e: e["phase"] == "discussion", timeout=30)
        # Forfeiting the sole Mafia would correctly finish the Game early.
        listener_player = next(p for p in players[1:] if p.latest["game_state"]["self"]["role"] != "mafia")
        sender_player = next(p for p in players if p is not listener_player)
        sender, url, token0 = await sender_player.voice(); media.append(sender)
        listener, _, token1 = await listener_player.voice(); media.append(listener)
        received = asyncio.Event()
        audible_frames = [0]
        consumers = []
        async def consume(track):
            async for event in rtc.AudioStream(track):
                samples = np.frombuffer(event.frame.data, dtype=np.int16)
                if len(samples) and np.max(np.abs(samples.astype(np.int32))) > 100:
                    received.set()
                    audible_frames[0] += 1
        @listener.on("track_subscribed")
        def subscribed(track, publication, participant):
            consumers.append(asyncio.create_task(consume(track)))
        source = rtc.AudioSource(48000, 1)
        track = rtc.LocalAudioTrack.create_audio_track("proof tone", source)
        await sender.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        async def publish_tone():
            wave = (np.sin(np.arange(960) * 2 * np.pi * 1000 / 48000) * 8000).astype(np.int16).tobytes()
            while True:
                await source.capture_frame(rtc.AudioFrame(wave, 48000, 1, 960))
                await asyncio.sleep(0.02)
        tone = asyncio.create_task(publish_tone())
        await asyncio.wait_for(received.wait(), 15)
        print("PASS: independent clients receive nonzero WebRTC audio", flush=True)
        # Use a hostile raw signaling client: native SDKs can hang internally when
        # a deliberately forbidden AddTrack receives no acknowledgement.
        attacker = next(p for p in players if p not in (sender_player, listener_player))
        await attacker.send("join_voice", round=1)
        attacker_grant = await attacker.wait("voice_state")
        options = dict(access_token=attacker_grant["token"], protocol=16, sdk="python",
                       version="1.1.20", auto_subscribe=1)
        before = audible_frames[0]
        async with websockets.connect(url + "/rtc?" + urlencode(options),
                                      origin="http://localhost:5173") as connection:
            first = signal.SignalResponse.FromString(await connection.recv())
            assert first.WhichOneof("message") == "join"
            for cid, source_kind in (("forbidden", models.TrackSource.CAMERA), ("control", models.TrackSource.MICROPHONE)):
                request = signal.SignalRequest(add_track=signal.AddTrackRequest(
                    cid=cid, name=cid, type=models.TrackType.AUDIO, source=source_kind))
                await connection.send(request.SerializeToString())
            async def accepted_control():
                while True:
                    response = signal.SignalResponse.FromString(await connection.recv())
                    if response.WhichOneof("message") == "track_published":
                        assert response.track_published.cid != "forbidden", "SFU accepted forbidden source"
                        if response.track_published.cid == "control": return
            await asyncio.wait_for(accepted_control(), 10)
            # Keep observing: a delayed forbidden acknowledgement also fails.
            async def no_forbidden_ack():
                while True:
                    response = signal.SignalResponse.FromString(await connection.recv())
                    if response.WhichOneof("message") == "track_published":
                        assert response.track_published.cid != "forbidden", "Delayed forbidden publication"
            try:
                await asyncio.wait_for(no_forbidden_ack(), 1)
            except asyncio.TimeoutError:
                pass  # Only the absence window may time out; accepted control is mandatory.
        assert audible_frames[0] > before, "Authorized media stopped during permission probe"
        print("PASS: SFU refuses forbidden publication, acknowledges authorized control, and continues audio", flush=True)
        await listener_player.send("leave_room")
        await listener_player.wait("room_left")
        await asyncio.sleep(1)
        assert not listener.isconnected(), "Leave did not disconnect media"
        stale = rtc.Room()
        try:
            await asyncio.wait_for(stale.connect(url, token1), 10)
        except rtc.ConnectError as error:
            assert "403" in str(error), str(error)
            print("PASS: Leave revokes media and stale-token admission", flush=True)
        else:
            await stale.disconnect()
            raise AssertionError("Stale participant regained hearing")
        await players[0].wait("game_state", lambda e: e["phase"] == "voting", timeout=110)
        assert sender.isconnected(), "Voice did not persist through voting"
        await sender_player.wait("voice_state", lambda e: e["token"] is None, timeout=40)
        await asyncio.sleep(1)
        assert not sender.isconnected(), "Voice persisted beyond Townhall"
        print("PASS: Townhall expiry revokes media; Night cannot publish or subscribe", flush=True)
    finally:
        if tone: tone.cancel()
        for consumer in locals().get("consumers", []): consumer.cancel()
        for room in media: await asyncio.wait_for(room.disconnect(), 10)
        for player in players: await player.socket.close()

if __name__ == "__main__":
    asyncio.run(main())
