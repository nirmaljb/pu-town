"""Real Day media delivery and denied subscriptions through public Game requests.
No browser automation; run with the same environment as verify.py.
"""
import asyncio
import math
from urllib.parse import urlencode, urlsplit, urlunsplit

import numpy as np
import websockets
from livekit import rtc
from livekit.protocol import rtc as signal, models
from verify import Player, GAME

async def walk(player, x, y):
    async def walking():
        while True:
            own = player.latest["field_state"]["self"]
            dx, dy = x - own["x"], y - own["y"]
            distance = math.hypot(dx, dy)
            if distance < 0.2:
                return
            step = min(18, distance)
            await player.send("move", x=own["x"] + dx / distance * step,
                              y=own["y"] + dy / distance * step, facing="down")
            await asyncio.sleep(0.12)
    await asyncio.wait_for(walking(), 20)

async def main():
    players = [await Player().connect() for _ in range(4)]
    media, consumers = [], []
    tone = None
    try:
        await players[0].send("create_room", displayName="Day voice 0")
        snapshot = await players[0].wait("room_snapshot")
        for i, player in enumerate(players[1:], 1):
            await player.send("join_room", roomId=snapshot["roomId"], displayName=f"Day voice {i}")
            await player.wait("room_snapshot")
        for player in players:
            await player.send("set_ready", ready=True)
        await players[0].wait("room_state", lambda e: all(p["ready"] for p in e["players"]))
        await players[0].send("start_game")
        await players[0].wait("game_state", lambda e: e["phase"] == "day")
        for player in players[:3]:
            await player.wait("field_state")
        await asyncio.gather(walk(players[0], 1280, 742), walk(players[1], 1400, 742), walk(players[2], 1480, 742))
        for player in players[:3]:
            await player.send("join_voice", round=1)
            await player.wait("voice_state", lambda e: e["token"] is not None)
        ids = [p.latest["room_snapshot"]["selfPlayerId"] for p in players]
        await players[1].wait("voice_peers", lambda e: any(p["playerId"] == ids[0] for p in e["peers"]))
        parts = urlsplit(GAME)
        url = urlunsplit((parts.scheme, parts.netloc, "/voice", "", ""))
        sender = rtc.Room(); media.append(sender)
        await asyncio.wait_for(sender.connect(url, players[0].latest["voice_state"]["token"]), 20)
        listener = rtc.Room(); media.append(listener)
        received = asyncio.Event()
        speaking = asyncio.Event()
        @listener.on("active_speakers_changed")
        def active_speakers(participants):
            if any(p.name == ids[0] for p in participants): speaking.set()
        frames = [0]
        async def consume(track):
            async for event in rtc.AudioStream(track):
                samples = np.frombuffer(event.frame.data, dtype=np.int16)
                if np.max(np.abs(samples.astype(np.int32)), initial=0) > 100:
                    received.set(); frames[0] += 1
        @listener.on("track_subscribed")
        def subscribed(track, publication, participant):
            consumers.append(asyncio.create_task(consume(track)))
        peer = next(p for p in players[1].latest["voice_peers"]["peers"] if p["playerId"] == ids[0])
        assert abs(peer["gain"] - 5 / 12) < 0.001
        token = peer["token"]
        await asyncio.wait_for(listener.connect(url, token), 20)
        source = rtc.AudioSource(48000, 1)
        track = rtc.LocalAudioTrack.create_audio_track("Day proof tone", source)
        publication = await sender.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        async def publish():
            wave = (np.sin(np.arange(960) * 2 * np.pi * 1000 / 48000) * 8000).astype(np.int16).tobytes()
            while True:
                await source.capture_frame(rtc.AudioFrame(wave, 48000, 1, 960))
                await asyncio.sleep(0.02)
        tone = asyncio.create_task(publish())
        await asyncio.wait_for(received.wait(), 15)
        await asyncio.wait_for(speaking.wait(), 10)
        assert next(iter(listener.remote_participants.values())).name == ids[0]
        assert not sender.remote_participants, "Hidden listeners leaked to the speaker"
        assert len(listener.remote_participants) == 1
        assert all(p["playerId"] != ids[0] for p in players[2].latest["voice_peers"]["peers"])
        print("PASS: real Day PCM delivery, independent third-Player hearing, authorized speaker activity and hidden listener identities", flush=True)
        options = dict(access_token=players[2].latest["voice_state"]["token"], protocol=16,
                       sdk="python", version="1.1.20", auto_subscribe=1)
        before = frames[0]
        async with websockets.connect(url + "/rtc?" + urlencode(options), origin="http://localhost:5173") as connection:
            joined = signal.SignalResponse.FromString(await connection.recv())
            assert joined.WhichOneof("message") == "join"
            assert not joined.join.participant.permission.can_subscribe
            await connection.send(signal.SignalRequest(subscription=signal.UpdateSubscription(
                track_sids=[publication.sid], subscribe=True)).SerializeToString())
            await connection.send(signal.SignalRequest(add_track=signal.AddTrackRequest(
                cid="authorized-control", type=models.TrackType.AUDIO, source=models.TrackSource.MICROPHONE)).SerializeToString())
            async def control():
                while True:
                    response = signal.SignalResponse.FromString(await connection.recv())
                    assert response.WhichOneof("message") != "offer", "Forbidden subscription established subscriber media"
                    if response.WhichOneof("message") == "track_published":
                        assert response.track_published.cid == "authorized-control"
                        return
            await asyncio.wait_for(control(), 10)
        await asyncio.sleep(0.5)
        assert frames[0] > before
        print("PASS: real SFU denies a modified client's foreign-track subscription while authorized audio continues", flush=True)
        old_primary = players[1].latest["voice_state"]["token"]
        old_player = players[1]
        replacement = await Player().connect()
        await replacement.send("recover_room", roomId=snapshot["roomId"], recoveryToken=old_player.latest["room_snapshot"]["recoveryToken"])
        recovered = await replacement.wait("room_snapshot")
        assert recovered["selfPlayerId"] == ids[1]
        players[1] = replacement
        old_player.reader.cancel()
        async def retired():
            while listener.isconnected(): await asyncio.sleep(0.1)
        await asyncio.wait_for(retired(), 10)
        for retired_token in [old_primary, token]:
            stale = rtc.Room()
            try:
                await asyncio.wait_for(stale.connect(url, retired_token), 10)
            except rtc.ConnectError as error:
                assert "403" in str(error), str(error)
            else:
                await stale.disconnect()
                raise AssertionError("Takeover retained an old voice credential")
        await replacement.send("join_voice", round=1)
        await replacement.wait("voice_state", lambda e:e["token"] is not None)
        peers = await replacement.wait("voice_peers", lambda e:any(p["playerId"] == ids[0] for p in e["peers"]))
        fresh_token = next(p["token"] for p in peers["peers"] if p["playerId"] == ids[0])
        assert fresh_token != token
        listener = rtc.Room(); media.append(listener)
        listener.on("track_subscribed", subscribed)
        received.clear()
        await listener.connect(url, fresh_token)
        await asyncio.wait_for(received.wait(), 15)
        token = fresh_token
        print("PASS: takeover retires actual listening media and both old grants; the same Player receives fresh authorized PCM", flush=True)
        await walk(players[1], 1340, 742)
        await players[1].wait("voice_peers", lambda e: any(p["playerId"] == ids[0] and p["gain"] == 1 for p in e["peers"]))
        await walk(players[1], 1500, 742)
        await players[1].wait("voice_peers", lambda e: all(p["playerId"] != ids[0] for p in e["peers"]))
        async def disconnected():
            while listener.isconnected():
                await asyncio.sleep(0.1)
        await asyncio.wait_for(disconnected(), 10)
        stale = rtc.Room()
        try:
            await asyncio.wait_for(stale.connect(url, token), 10)
        except rtc.ConnectError as error:
            assert "403" in str(error), str(error)
        else:
            await stale.disconnect()
            raise AssertionError("Retired hearing grant regained audio")
        print("PASS: full gain within two tiles; movement revokes actual media and stale hearing credentials", flush=True)
    finally:
        if tone: tone.cancel()
        for consumer in consumers: consumer.cancel()
        for room in media: await asyncio.wait_for(room.disconnect(), 10)
        for player in players: await player.socket.close()

if __name__ == "__main__":
    asyncio.run(main())
