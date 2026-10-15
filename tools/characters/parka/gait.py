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
# Contact points relative to the ankle when the boot is flat: heel and ball.
HEEL = Vector((0, 0.08, -0.09))
BALL = Vector((0, -0.10, -0.06))

GAITS = {
    # front/back: ankle distance ahead of and behind the hip at landing and toe-off.
    'Walk': dict(speed=2.25, duty=0.60, front=0.26, back=0.38, hip=0.858, bob=0.012, bob_phase=0.0,
                 lift=0.055, kick=0.0, strike=-15, toe_off=35, lean=4, arm=18, arm_back=2, elbow=16,
                 elbow_swing=6, pelvis=6, sway=0.012),
    'Run': dict(speed=4.5, duty=0.30, front=0.21, back=0.36, hip=0.838, bob=0.028, bob_phase=0.15,
                lift=0.10, kick=0.04, strike=-4, toe_off=45, lean=14, arm=22, arm_back=8, elbow=62,
                elbow_swing=8, pelvis=9, sway=0.006),
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
    if q < 0.15:
        pitch = g['strike'] * (1 - q / 0.15)
        pivot = reference + HEEL
        offset = HEEL
    elif q < 0.6:
        return reference, 0.0
    else:
        pitch = g['toe_off'] * ease((q - 0.6) / 0.4)
        pivot = reference + BALL
        offset = BALL
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
    travel = ease((u - 0.12) / 0.88) if g['kick'] else ease(u)
    ankle = start.lerp(end, travel)
    ankle.z += g['lift'] * math.sin(math.pi * u ** 0.8)
    # A running heel folds up behind before swinging through.
    ankle.y += g['kick'] * math.sin(math.pi * min(1.0, u / 0.6))
    ankle.z += g['kick'] * 0.9 * math.sin(math.pi * min(1.0, u / 0.6))
    # The toe lifts straight after toe-off to clear the snow, then the heel leads.
    pitch = start_pitch * (1 - ease(u / 0.35)) + end_pitch * ease((u - 0.55) / 0.45)
    return ankle, pitch, False


def leg_ik(hip, ankle):
    """World thigh angle forward of vertical and knee flexion, both in degrees."""
    d = ankle - hip
    forward, down = -d.y, -d.z
    reach = min(math.hypot(forward, down), THIGH + SHIN - 0.002)
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
    spine = rot(Z, g['pelvis'] * 0.6 * turn) @ rot(X, g['lean'])
    world = {
        'Hips': pelvis,
        'Spine': rot(X, g['lean'] * 0.7) @ rot(Z, g['pelvis'] * 0.1 * turn),
        'Chest': spine,
        'UpperChest': rot(Z, g['pelvis'] * 0.9 * turn) @ rot(X, g['lean']),
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
        # Toes stay level while the heel is raised, so the toe tip never digs in.
        world[f'{side}Toes'] = rot(X, min(pitch, 0.0))
        planted[side] = grounded
        # Arms swing against the legs; the left arm leads when the right boot lands.
        swing = g['arm'] * turn * s + g['arm_back']
        elbow = g['elbow'] + g['elbow_swing'] * -turn * s
        down = rot(Y, s * 77)
        world[f'{side}Shoulder'] = world['UpperChest'] @ rot(Y, s * 8)
        world[f'{side}UpperArm'] = world['UpperChest'] @ rot(X, swing) @ down
        world[f'{side}LowerArm'] = world['UpperChest'] @ rot(X, swing - elbow) @ down
        world[f'{side}Hand'] = world[f'{side}LowerArm']
    return world, offset, planted


def stand():
    world = {}
    # Knees a little soft, boots flat under the hips.
    offset = Vector((0, 0, -0.004))
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
