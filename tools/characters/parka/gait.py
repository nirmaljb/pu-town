"""Walk, Run and Stand poses as world-space joint rotations for each cycle phase.

A cycle is two steps: the left boot lands at phase 0 and the right at 0.5. Each
stance boot moves straight back at body speed, so when a game advances the phase
by distance travelled, planted boots stay fixed on the ground. The game reads the
same step lengths and landing offsets from gait.json to place Footprints.
"""
import math

from mathutils import Quaternion, Vector

from shape import JOINTS

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
THIGH = (Vector(JOINTS['LeftUpperLeg'][0]) - Vector(JOINTS['LeftUpperLeg'][1])).length
SHIN = (Vector(JOINTS['LeftLowerLeg'][0]) - Vector(JOINTS['LeftLowerLeg'][1])).length
ANKLE = 0.09
HIP = JOINTS['LeftUpperLeg'][0][2]
# Contact points relative to the ankle when the boot is flat: the heel, the ball
# (the toe joint) and the sole under the toe box, where a stiff boot rolls off.
HEEL = Vector((0, 0.08, -0.09))
BALL = Vector((0, -0.10, -0.06))
TIP = Vector((0, -0.205, -0.085))

GAITS = {
    # front/back: flat-boot ankle distance ahead of and behind the hip at landing and toe-off.
    # roll/heel: stance fractions where the landing boot is flat and where its heel rises.
    # lift_peak: swing lift is sin(pi * u ** lift_peak); below 1 it peaks earlier in the swing.
    # pitch_hold/pitch_turn: swing fractions where the toe-off pitch has gone and the landing pitch begins.
    # reach/reach_end: the swinging boot's forward travel follows ease((u / reach_end) ** reach),
    # so it is out in front by reach_end of the swing and then settles onto the snow.
    # kick/kick_rise/kick_end: the heel folds up behind (back kick, up kick * kick_rise) early in the swing.
    # arm_lag: how far the arm swing trails the legs, in cycles; negative leads.
    # rocker: the boot stays stiff and rolls off the TIP; otherwise it bends at the ball.
    # pelvis/shoulders: yaw of the hips with the legs and of the shoulders against them.
    # Walk is fitted to the owner's walk recording (reference/walk-left.png): its
    # 0.62 m step, stance, toe-up landing and 3 cm bob are measured, and the rest
    # were chosen to match its silhouettes phase by phase (README, Walk).
    'Walk': dict(speed=2.25, duty=0.62, front=0.319, back=0.45, hip=0.8635, bob=0.0145, bob_phase=0.0,
                 lift=0.0, lift_peak=0.3, kick=0.019, kick_rise=2.27, kick_end=0.52, swing_delay=0.0,
                 reach=0.74, reach_end=0.94, strike=-20, roll=0.21, heel=0.68, toe_off=46.2,
                 pitch_hold=0.70, pitch_turn=0.35, lean=1.5, arm=16.8, arm_back=-1.8, arm_lag=-0.032,
                 elbow=10.8, elbow_swing=0.5, pelvis=13, shoulders=5, sway=0.012, rocker=True),
    'Run': dict(speed=4.5, duty=0.30, front=0.21, back=0.36, hip=0.855, bob=0.022, bob_phase=0.15,
                lift=0.10, lift_peak=0.8, kick=0.04, kick_end=0.6, swing_delay=0.12, strike=-4, roll=0.15,
                heel=0.6, toe_off=45, pitch_hold=0.35, pitch_turn=0.55, lean=10, arm=22, arm_back=8, elbow=62,
                elbow_swing=8, pelvis=9, shoulders=8.1, sway=0.006, reach=1.0, reach_end=1.0, kick_rise=0.9,
                arm_lag=0.0, rocker=False),
}
for _g in GAITS.values():
    _g['stroke'] = _g['front'] + _g['back']
    _g['step'] = _g['stroke'] / _g['duty'] / 2
    _g['cycle_seconds'] = 2 * _g['step'] / _g['speed']


def rot(axis, degrees):
    return Quaternion(axis, math.radians(degrees))


def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def stance_ankle(g, q):
    """Ankle (y forward-negative, z) and boot pitch for stance progress q in [0, 1]."""
    reference = Vector((0, -g['front'] + g['stroke'] * q, ANKLE))
    if q < g['roll']:
        pitch = g['strike'] * (1 - q / g['roll'])
        pivot = reference + HEEL
        offset = HEEL
    elif q < g['heel']:
        return reference, 0.0
    else:
        pitch = g['toe_off'] * ease((q - g['heel']) / (1 - g['heel']))
        offset = TIP if g['rocker'] else BALL
        pivot = reference + offset
    # Pitch rotates about X: positive lowers the toe. The pivot stays planted.
    return pivot - rot(X, pitch) @ offset, pitch


def foot(g, q):
    """Ankle position, boot pitch and whether the boot is planted, for foot phase q."""
    duty = g['duty']
    if q < duty:
        ankle, pitch = stance_ankle(g, q / duty)
        return ankle, pitch, True
    u = (q - duty) / (1 - duty)
    start, start_pitch = stance_ankle(g, 1.0)
    end, end_pitch = stance_ankle(g, 0.0)
    delay = g['swing_delay']
    travel = min(1.0, u / g['reach_end']) ** g['reach']
    ankle = start.lerp(end, ease((travel - delay) / (1 - delay)))
    ankle.z += g['lift'] * math.sin(math.pi * u ** g['lift_peak'])
    # The heel folds up behind before swinging through.
    fold = math.sin(math.pi * min(1.0, u / g['kick_end']))
    ankle.y += g['kick'] * fold
    ankle.z += g['kick'] * g['kick_rise'] * fold
    # The toe stays down after toe-off to clear the snow, then the heel leads.
    hold, turn = g['pitch_hold'], g['pitch_turn']
    pitch = start_pitch * (1 - ease(u / hold)) + end_pitch * ease((u - turn) / (1 - turn))
    return ankle, pitch, False


def leg_ik(hip, ankle):
    """World thigh angle forward of vertical and knee flexion, both in degrees."""
    d = ankle - hip
    forward, down = -d.y, -d.z
    reach = min(math.hypot(forward, down), THIGH + SHIN - 0.0005)
    phi = math.atan2(forward, down)
    a = math.acos((THIGH ** 2 + reach ** 2 - SHIN ** 2) / (2 * THIGH * reach))
    knee = math.pi - math.acos((THIGH ** 2 + SHIN ** 2 - reach ** 2) / (2 * THIGH * SHIN))
    return math.degrees(phi + a), math.degrees(knee)


def pose(name, phase):
    """World-space rotation deltas per bone and the Hips offset, at a cycle phase."""
    if name == 'Stand':
        return stand()
    g = GAITS[name]
    turn = math.cos(2 * math.pi * phase)
    hip_z = g['hip'] - g['bob'] * math.cos(4 * math.pi * (phase - g['bob_phase']))
    sway = g['sway'] * math.sin(2 * math.pi * phase - math.pi / 2)
    offset = Vector((sway, 0, hip_z - HIP))
    pelvis = rot(Z, -g['pelvis'] * turn) @ rot(X, g['lean'] * 0.4)
    chest = rot(Z, g['shoulders'] * 2 / 3 * turn) @ rot(X, g['lean'])
    world = {
        'Hips': pelvis,
        'Spine': rot(X, g['lean'] * 0.7) @ rot(Z, g['shoulders'] / 9 * turn),
        'Chest': chest,
        'UpperChest': rot(Z, g['shoulders'] * turn) @ rot(X, g['lean']),
        'Neck': rot(X, g['lean'] * 0.3),
        'Head': rot(X, -g['lean'] * 0.2),
    }
    planted = {}
    for side, s, start in (('Left', 1, 0.0), ('Right', -1, 0.5)):
        ankle, pitch, grounded = foot(g, (phase - start) % 1.0)
        ankle.x = s * 0.105
        hip = Vector(JOINTS[f'{side}UpperLeg'][0]) + offset
        hip = Vector(JOINTS['Hips'][0]) + offset + pelvis @ (hip - offset - Vector(JOINTS['Hips'][0]))
        thigh, knee = leg_ik(hip, ankle)
        world[f'{side}UpperLeg'] = rot(X, -thigh)
        world[f'{side}LowerLeg'] = rot(X, -(thigh - knee))
        world[f'{side}Foot'] = rot(X, pitch)
        # A stiff boot pitches whole; a bending one keeps its toes level while the
        # heel is raised, so the toe tip never digs in.
        world[f'{side}Toes'] = rot(X, pitch if g['rocker'] else min(pitch, 0.0))
        planted[side] = grounded
        # Arms swing against the legs; the left arm leads when the right boot lands.
        arm_turn = math.cos(2 * math.pi * (phase - g['arm_lag']))
        swing = g['arm'] * arm_turn * s + g['arm_back']
        elbow = g['elbow'] + g['elbow_swing'] * -arm_turn * s
        down = rot(Y, s * 77)
        world[f'{side}Shoulder'] = world['UpperChest'] @ rot(Y, s * 8)
        world[f'{side}UpperArm'] = world['UpperChest'] @ rot(X, swing) @ down
        world[f'{side}LowerArm'] = world['UpperChest'] @ rot(X, swing - elbow) @ down
        world[f'{side}Hand'] = world[f'{side}LowerArm']
    return world, offset, planted


def stand():
    world = {}
    # Legs straight but for about 4 degrees at the knee, boots flat under the hips.
    offset = Vector((0, 0, -0.0005))
    for side, s in (('Left', 1), ('Right', -1)):
        hip = Vector(JOINTS[f'{side}UpperLeg'][0]) + offset
        thigh, knee = leg_ik(hip, Vector((s * 0.105, 0, ANKLE)))
        world[f'{side}UpperLeg'] = rot(X, -thigh)
        world[f'{side}LowerLeg'] = rot(X, -(thigh - knee))
        world[f'{side}Foot'] = rot(X, 0.0)
        world[f'{side}Shoulder'] = rot(Y, s * 6)
        world[f'{side}UpperArm'] = rot(X, 3) @ rot(Y, s * 76)
        world[f'{side}LowerArm'] = rot(X, -10) @ rot(Y, s * 76)
        world[f'{side}Hand'] = world[f'{side}LowerArm']
    return world, offset, {'Left': True, 'Right': True}


def landing_offset(name):
    """How far ahead of the body a landing boot's centre lies once it is flat.

    The boot settles onto that point and stays there through its stance, so it
    is where the Footprint belongs. The boot's centre is 5 cm ahead of its ankle.
    """
    return GAITS[name]['front'] + 0.05
