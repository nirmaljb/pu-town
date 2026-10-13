# Native voice evidence

| Boundary | Current evidence |
| --- | --- |
| SDK source and package | Official LiveKit Unity v2.1.0, commit `356bf5dfe079fd981cd514271b32d6cfe5d5516f`; actual UPM/Git LFS resolution and compile succeeded on macOS with Unity 6000.6.0f1. |
| Grant, PCM gate and gain tests | All four Voice EditMode tests passed within the final 36/36 native suite, with no failures or skips. Evidence: `.scratch/native/final-verification/quaternius-committed-editmode.xml`. This includes the device-switch hook. |
| Java regression boundary | Before storage cleanup, all 150 tests passed with no failures, errors or skips and package repeated them. After the authored-artifact check became explicit opt-in, the ordinary suite passed with 150 discovered and one intentional skip; all five native-publication cases passed with the flag enabled against local artifacts. This is server/contract evidence, not native microphone or listening evidence. |
| Real Java/LiveKit/Unity DSP | Final refreshed PlayMode run passed 2/2 with no failures or skips on macOS 26.2 arm64, Unity 6000.6.0f1, Java at port 18093 and LiveKit 1.13.7, 13 October 2026 17:30 UTC. Combined duration 8.476s; the voice test took 3.942s. It verifies real SDK Day/Townhall nonzero Unity output PCM, transport-only movement revocation while the frame view stayed old, stale SDK-token refusal, Night grant clearance and eliminated listening-only authority. Sender input was synthetic PCM. Evidence: `.scratch/native/final-verification/quaternius-restarted-playmode.xml` and matching `.log`. |
| Actual Room-pinned Avatar loading | The other final PlayMode test passed actual Room entry, HTTP native collection loading and Humanoid instantiation of the refreshed Ash/Lea publication with declared identity, in 4.498s. This verifies asset loading alongside the media boundary; it does not establish complete packaged multiplayer acceptance. |
| Native gateway refresh | Existing gateway rewrites SFU refreshed credentials; a native long-lived refresh/reconnect check remains pending. |
| Microphone permissions/devices/AEC | Pinned source inspected, permission/device/status path implemented. OS interaction and effective AEC not yet verified. |
| Actual audible two-client Townhall/Day | Pending. Synthetic PCM and signaling will not be reported as audible proof. |
| Windows packaged runtime | Both platform release artifacts built; Windows execution, microphone and performance checks remain pending because the owner has no Windows machine. |
| Ten-Player native sustained load | Pending; existing Python capacity checks are a separate boundary. |

The final integration used Java on `ws://127.0.0.1:18093/ws/game` with Developer Rooms enabled and the private local LiveKit v1.13.7 service on loopback 7880. The isolated Unity project is `.scratch/native/acceptance`; opt-in PlayMode configuration uses `PU_TOWN_NATIVE_VOICE_E2E=1` and `PU_TOWN_NATIVE_VOICE_WS=ws://127.0.0.1:18093/ws/game`. No private credentials are recorded here.

The first PlayMode attempt failed before media because the fixture waited for only the guest Day phase and then dereferenced the host field before that recipient's separate field snapshot arrived. It now waits for both authoritative field snapshots.

Packaged loading exposed a separate Avatar metadata mismatch: the manifest declared root `Avatar`, while the actual bundle prefab root was `avatar`. The real Room/HTTP/instantiation regression failed on that exact mismatch. Private drafts were corrected and atomically republished; bundle bytes, hashes and retained masters were preserved. Authoring now records the saved prefab's exact root and verifies bundle root, rig and clips against publication. The final regression passed for both designs.

A later real media rerun caught the synthetic Day producer continuing after its grant retired, causing SDK capture errors. The fixture now checks its primary grant, stops on SDK disconnect, serializes capture shutdown, joins its producer and lets queued native callbacks complete before disposing handles. It also stops Day production before Night. Blanket SDK error suppression was removed, and all PCM, revocation, stale-token, Night and eligibility assertions remain. The final 2/2 run passed after these fixes.

Nonzero synthetic PCM at Unity's output proves an actual media path. It does not prove microphone permissions or capture, effective echo cancellation/noise processing, device recovery, audible headset playback or directional listening; those checks remain unverified.

Final refreshed rerun: 2/2 opt-in real native Avatar and Java/LiveKit/Unity DSP tests passed without skips (8.476 seconds), after restarting task-owned local fixtures. The preceding attempt loaded both Avatars but failed an ICE connection with `wait_pc_connection timed out`; the reset is not causal proof. The new 36-test native suite and both 150-test Java full runs passed. This remains synthetic PCM boundary evidence, with no microphone permission or audible headset claim.
