"""Real Townhall PCM for a Night-eliminated Participant; no browser automation."""
import asyncio
from urllib.parse import urlencode
import numpy as np
import websockets
from livekit import rtc
from livekit.protocol import rtc as signal, models
from verify import Player, GAME
from verify_tokens import denied

async def main():
    players, rooms, consumers = [], [], []
    tone = None
    try:
        players = [await Player().connect() for _ in range(4)]
        await players[0].send('create_room', displayName='Ghost proof 0')
        snapshot = await players[0].wait('room_snapshot')
        for i, player in enumerate(players[1:], 1):
            await player.send('join_room', roomId=snapshot['roomId'], displayName=f'Ghost proof {i}')
            await player.wait('room_snapshot')
        for player in players:
            await player.send('set_ready', ready=True)
        await players[0].wait('room_state', lambda e: all(p['ready'] for p in e['players']))
        await players[0].send('start_game')
        await players[0].wait('game_state', lambda e: e['phase'] == 'night')
        mafia = next(p for p in players if p.latest['game_state']['self']['role'] == 'mafia')
        ghost = next(p for p in players if p.latest['game_state']['self']['role'] == 'villager')
        await mafia.send('night_choice', round=1, targetPlayerId=ghost.latest['room_snapshot']['selfPlayerId'])
        await ghost.wait('game_state', lambda e: e['phase'] == 'discussion', timeout=30)
        assert ghost.latest['game_state']['self']['status'] == 'eliminated'
        sender, url, _ = await mafia.voice(); rooms.append(sender)
        listener, _, token = await ghost.voice(); rooms.append(listener)
        assert ghost.latest['voice_state']['canPublish'] is False
        received = asyncio.Event()
        async def consume(track):
            stream = rtc.AudioStream(track)
            try:
                async for event in stream:
                    samples = np.frombuffer(event.frame.data, dtype=np.int16).astype(np.int32)
                    if np.max(np.abs(samples), initial=0) > 100:
                        received.set(); return
            finally:
                await stream.aclose()
        @listener.on('track_subscribed')
        def subscribed(track, publication, participant):
            assert participant.name == mafia.latest['room_snapshot']['selfPlayerId']
            consumers.append(asyncio.create_task(consume(track)))
        source = rtc.AudioSource(48000, 1)
        track = rtc.LocalAudioTrack.create_audio_track('Living Townhall tone', source)
        await asyncio.wait_for(sender.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)), 15)
        async def publish():
            wave = (np.sin(np.arange(960)*2*np.pi*1000/48000)*8000).astype(np.int16).tobytes()
            while True:
                await source.capture_frame(rtc.AudioFrame(wave,48000,1,960)); await asyncio.sleep(.02)
        tone = asyncio.create_task(publish())
        await asyncio.wait_for(received.wait(), 15)
        print('PASS: Night-eliminated Participant receives living Townhall PCM with canPublish false', flush=True)
        # Replace only the Ghost media connection with hostile raw signaling.
        await listener.disconnect()
        options = dict(access_token=token, protocol=16, sdk='python', version='1.1.20', auto_subscribe=1)
        raw = url + '/rtc?' + urlencode(options)
        async with websockets.connect(raw, origin='http://localhost:5173') as connection:
            assert signal.SignalResponse.FromString(await connection.recv()).WhichOneof('message') == 'join'
            request = signal.SignalRequest(add_track=signal.AddTrackRequest(cid='ghost-microphone', name='Forbidden Ghost', type=models.AUDIO, source=models.MICROPHONE))
            await connection.send(request.SerializeToString())
            try:
                while True:
                    response = signal.SignalResponse.FromString(await asyncio.wait_for(connection.recv(), 10))
                    assert response.WhichOneof('message') != 'track_published', 'Ghost publication was acknowledged'
            except websockets.exceptions.ConnectionClosed as error:
                assert error.code == 4003
        await denied(raw, 403)
        assert sender.isconnected()
        print('PASS: Ghost microphone publication closes signaling and retires its grant; living publisher remains connected', flush=True)
    finally:
        if tone: tone.cancel()
        for consumer in consumers: consumer.cancel()
        await asyncio.gather(*consumers, return_exceptions=True)
        await asyncio.gather(*(room.disconnect() for room in rooms), return_exceptions=True)
        for player in players: await player.socket.close()

if __name__ == '__main__': asyncio.run(main())
