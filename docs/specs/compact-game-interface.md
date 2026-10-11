# Compact game interface

Agreed with the owner for the latest `live-619e990-tailscale` baseline, commit `ed34db0`:

- Use the local Silkscreen pixel font throughout the interface and Phaser labels.
- Center a shared, Host-controlled Town Map selector above Ready/Start in the Lobby. Offer Sunwater Village, Blackthorn Hollow and Neon Ward as playable towns; all Players see the accepted selection, which locks at Start and survives recovery.
- Keep phase/countdown, compact Role information, relevant actions and essential Lobby controls visible. Put Role Setup, Avatar selection, instructions and detailed results behind expandable controls; show chat in its relevant phases.
- M toggles a full-town overlay. Escape closes it. Stop local movement while it is open, ignore M while typing, and keep the server clock running. Show terrain, the recipient's position and personal Tasks without widening Player visibility.
- Reserve M for the overview; older push-to-talk preferences using M fall back to V.

Agreed verification seams: WebSocket requests/events for selection, Start locking, recovery and privacy; the strict frontend protocol decoder; public map-overlay controls. Verify the changed interface with real browser clients at desktop and mobile sizes.
