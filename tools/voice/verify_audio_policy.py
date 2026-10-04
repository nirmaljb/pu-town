"""Real gateway proof: mislabeled video, video SDP, and v1 fast-publish are denied."""
import asyncio
import base64
import gzip
from urllib.parse import urlencode
import websockets
from livekit import rtc
from livekit.protocol import rtc as signal, models
from verify import Player, GAME
from verify_tokens import denied

async def main():
    player = await Player().connect()
    room = rtc.Room()
    public = GAME.removesuffix('/ws/game') + '/voice/rtc'
    options = dict(protocol=16, sdk='python', version='1.1.20', auto_subscribe=1)
    async def grant():
        await player.send('join_voice', round=1)
        return (await player.wait('voice_state'))['token']
    async def blocked(request):
        token = await grant()
        url = public + '?' + urlencode(dict(options, access_token=token))
        async with websockets.connect(url, origin='http://localhost:5173') as connection:
            assert signal.SignalResponse.FromString(await connection.recv()).WhichOneof('message') == 'join'
            await connection.send(request.SerializeToString())
            try:
                while True: await asyncio.wait_for(connection.recv(), 10)
            except websockets.exceptions.ConnectionClosed as error:
                assert error.code == 4003, str(error)
        await denied(url, 403)
    try:
        await player.send('create_room', displayName='Audio policy proof')
        await player.wait('room_snapshot')
        await player.send('start_practice')
        await player.wait('game_state')
        for phase in ('day', 'night'):
            await player.send('advance_practice', round=1, phase=phase)
            await player.wait('game_state', lambda e: e['phase'] != phase)
        video = signal.AddTrackRequest(cid='forbidden-video', name='Video declared microphone', type=models.VIDEO, source=models.MICROPHONE)
        await blocked(signal.SignalRequest(add_track=video))
        await blocked(signal.SignalRequest(offer=signal.SessionDescription(type='offer', sdp='v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n')))
        await blocked(signal.SignalRequest(offer=signal.SessionDescription(type='offer', sdp='v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendrecv\r\na=recvonly\r\n')))
        token = await grant()
        join = signal.JoinRequest(add_track_requests=[video]).SerializeToString()
        for compression, body in ((0, join), (1, gzip.compress(join))):
            wrapped = signal.WrappedJoinRequest(compression=compression, join_request=body).SerializeToString()
            encoded = base64.urlsafe_b64encode(wrapped).decode()
            await denied(public + '/v1?' + urlencode(dict(options, access_token=token, join_request=encoded)), 403)
        # The same final gateway still permits a genuine native microphone track.
        await asyncio.wait_for(room.connect(GAME.removesuffix('/ws/game') + '/voice', token), 15)
        source = rtc.AudioSource(48000, 1)
        track = rtc.LocalAudioTrack.create_audio_track('Authorized microphone', source)
        publication = await asyncio.wait_for(room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)), 15)
        assert publication.sid
        print('PASS: video mislabeled microphone, video SDP, and plain/gzip v1 video Join refused; native microphone publication succeeds')
    finally:
        await asyncio.wait_for(room.disconnect(), 10)
        await player.socket.close()

if __name__ == '__main__':
    asyncio.run(main())
