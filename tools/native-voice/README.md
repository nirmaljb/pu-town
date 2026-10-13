# Unity native voice

The Player build pins the official [LiveKit Unity SDK v2.1.0](https://github.com/livekit/client-sdk-unity/releases/tag/v2.1.0) at `356bf5dfe079fd981cd514271b32d6cfe5d5516f`. Unity Package Manager fetches `io.livekit.livekit-sdk` from its Git URL in `native/Packages/manifest.json`. Install Git LFS before resolving packages; the SDK's platform plugins are LFS objects. The existing Newtonsoft dependency is `3.2.1`. No SDK binaries or credentials are copied into repository source.

`NativeVoiceClient` installs automatically on `NativeGameClient` and implements `INativeVoiceControls`. Runtime owns the settings controls, preferences and Avatar pose. The voice assembly owns media admission, `join_voice`/`leave_voice`, capture and playback. It never creates its own SFU credentials: its only signaling entrance is the server-granted `/voice` on the Game WebSocket origin. The SDK appends `/rtc` or `/rtc/v1`; both existing gateway routes enforce the grant and rewrite refreshed credentials.

During Day, one primary Room has publication and no subscription. Up to nine separate listening Rooms each admit one named speaker. Retained grants keep the same connection when only gain changes. Townhall uses its group Room; an eliminated Participant's grant permits listening and never creates capture. Night, result and finished phases have no admission. Failed media stays separate from the Game transport and obtains fresh grants after a bounded retry. Listening intent survives in-process recovery of the same Membership; recovery mutes capture and rejoins with new authority. Leave voice, Leave Room, failed recovery and takeover clear that intent. Voice credentials and microphone-enabled state are never persisted.

The microphone uses the pinned SDK's `MicrophoneSource` with `AudioProcessingOptions`: echo cancellation and gain control are enabled, and Noise Suppression follows the local setting. The [v2.1.0 implementation](https://github.com/livekit/client-sdk-unity/blob/356bf5dfe079fd981cd514271b32d6cfe5d5516f/Runtime/Scripts/Audio/MicrophoneSource.cs) runs libwebrtc processing on the Unity capture path. Its playout reference taps the active Unity AudioListener's final mix. The adapter requests OS permission only when the Player unmutes, checks the selected device, and reports denied permission or unavailable capture while listening continues. Microphone capture clears its own monitor output. The adapter does not instantiate `PlatformAudio`, which would introduce a second playback path. Processing availability is reported rather than treated as proof of effective echo cancellation.

Each remote track has one SDK `AudioStream`, one Unity `AudioSource` and an `AuthorizedVoiceFilter` after the SDK PCM producer. Unity applies [audio filters in component order](https://docs.unity.com/en-us/engine/6000.6/script-reference/unityengine/monobehaviour/onaudiofilterread). The filter is reappended after the SDK's producer when the audio output device changes. It multiplies PCM by `master × voice × server gain` once. Unity custom distance rolloff remains constant at one, Doppler and reverb are disabled, and spatial blend provides Day direction. The sole active AudioListener follows the Player's Avatar position and Facing; the elevated camera is not the hearing centre. Townhall output is nondirectional.

`GameSession.VoiceAuthorization` updates `VoiceAdmission` on the transport thread before the corresponding event reaches the frame inbox. A grant object is permanently retired when removed or replaced. Every DSP block checks that object, including after applying gain, so existing buffered PCM becomes silence without an `Update` or a rendered Game frame. The microphone's SDK capture gate is also muted directly on authority changes. Unity object disposal occurs on the main thread. The [pinned SDK Room implementation](https://github.com/livekit/client-sdk-unity/blob/356bf5dfe079fd981cd514271b32d6cfe5d5516f/Runtime/Scripts/Core/Room.cs) documents that `Disconnect` is a no-op while `Connect` is pending: the adapter observes completion and disconnects a retired connection again, with a `Connected` guard and closed PCM admission throughout. New connections are bounded to ten active/pending sessions, including retired connects still awaiting completion.

## Verification

The four Edit Mode tests exercise transport-thread PCM revocation without a frame, late connection admission, replacement/disable, ten-session retirement, read-only capture authority and exact gain composition. They are included in the normal Unity test run.

The separate Play Mode test is opt-in and uses real native Game WebSockets, Java Developer Rooms, LiveKit, the pinned Unity SDK and Unity DSP. Start LiveKit and the backend following [`tools/voice/README.md`](../voice/README.md), with `putown.developer.enabled=true` on a direct local listener. Then run the Unity test runner with:

```sh
PU_TOWN_NATIVE_VOICE_E2E=1 \
PU_TOWN_NATIVE_VOICE_WS=ws://127.0.0.1:8080/ws/game \
"$UNITY_EDITOR" -batchmode -projectPath "$NATIVE_TEST_PROJECT" \
  -runTests -testPlatform PlayMode \
  -testFilter PUtown.Voice.IntegrationTests.NativeGatewayVoiceTests \
  -testResults /tmp/pu-town-native-voice-playmode.xml \
  -logFile /tmp/pu-town-native-voice-playmode.log
```

Use a copied test project when the workspace project is open in another Editor. Keep Unity audio enabled. The integration test creates two real native Game connections plus two simulations, opens the Day publisher/listener topology, receives nonzero synthetic PCM at Unity's output filter, revokes a nearby speaker while Game frame application is stopped, rejects a retired credential through the native SDK, checks Night silence, receives Townhall PCM, and obtains an eliminated listening-only grant. The test does not request microphone permission. Its log reports boundary outcomes without tokens or endpoint credentials. A skipped test is not runtime evidence.

## Evidence and remaining acceptance

Source inspection established the release pin, gateway path compatibility, Unity capture processing, single playback path and pending-connect lifecycle. Runtime results belong in `evidence.md` with the actual platform and test output. Existing Python/Java/browser voice checks establish their own boundaries; they do not establish Unity microphone or audible playback.

Two packaged Unity clients on each supported OS still need recorded microphone permission/device and actual audible headset/speaker checks: Townhall listening versus publishing, PTT release across focus/chat/settings, independent master/voice levels, speaker direction from the Avatar, Day gain and interior transitions, rapid replacement/pending-connect revocation, Night and result silence, elimination, Disconnect/takeover and muted recovery. Check unplug/replug, denied permission, default-device changes and echo cancellation with game audio. Record sustained ten-Player native CPU/memory/audio behavior separately. macOS evidence does not establish Windows behavior, nonzero PCM does not establish audible headset output, and successful signaling does not establish media.
