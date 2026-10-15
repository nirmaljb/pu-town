"""Faceted parka geometry and its skin weights, built from measured cross-sections.

Blender axes: +Z up, the figure faces -Y, and its left side is +X. One unit is one
metre and the origin is the ground point between the boots. Every dimension was
read from the owner's front/side/back sheets at 680 px = 1.7 m (see README).
Pure Python: shape() returns plain lists, so the weights are checked without Blender.
"""
import math
import random

SEED = 9137

# Bone joints shared with rig.py: (head, tail) in metres, Left on +X.
JOINTS = {
    'Root': ((0, 0, 0), (0, 0, 0.12)),
    'Hips': ((0, 0, 0.90), (0, 0, 1.00)),
    'Spine': ((0, 0, 1.00), (0, 0, 1.12)),
    'Chest': ((0, 0, 1.12), (0, 0, 1.24)),
    'UpperChest': ((0, 0, 1.24), (0, 0, 1.36)),
    'Neck': ((0, 0.01, 1.36), (0, 0.01, 1.46)),
    'Head': ((0, 0.01, 1.46), (0, 0.01, 1.68)),
}
for _side, _s in (('Left', 1), ('Right', -1)):
    JOINTS.update({
        f'{_side}Shoulder': ((_s * 0.03, 0, 1.33), (_s * 0.19, 0, 1.29)),
        f'{_side}UpperArm': ((_s * 0.19, 0, 1.29), (_s * 0.43, 0, 1.287)),
        f'{_side}LowerArm': ((_s * 0.43, 0, 1.287), (_s * 0.655, 0, 1.276)),
        f'{_side}Hand': ((_s * 0.655, 0, 1.276), (_s * 0.80, 0, 1.262)),
        f'{_side}UpperLeg': ((_s * 0.105, 0, 0.88), (_s * 0.105, 0, 0.48)),
        f'{_side}LowerLeg': ((_s * 0.105, 0, 0.48), (_s * 0.105, 0, 0.09)),
        f'{_side}Foot': ((_s * 0.105, 0, 0.09), (_s * 0.105, -0.10, 0.03)),
        f'{_side}Toes': ((_s * 0.105, -0.10, 0.03), (_s * 0.105, -0.18, 0.03)),
    })
PARENTS = {
    'Hips': 'Root', 'Spine': 'Hips', 'Chest': 'Spine', 'UpperChest': 'Chest',
    'Neck': 'UpperChest', 'Head': 'Neck',
}
for _side in ('Left', 'Right'):
    PARENTS.update({
        f'{_side}Shoulder': 'UpperChest', f'{_side}UpperArm': f'{_side}Shoulder',
        f'{_side}LowerArm': f'{_side}UpperArm', f'{_side}Hand': f'{_side}LowerArm',
        f'{_side}UpperLeg': 'Hips', f'{_side}LowerLeg': f'{_side}UpperLeg',
        f'{_side}Foot': f'{_side}LowerLeg', f'{_side}Toes': f'{_side}Foot',
    })

# Torso cross-sections: (z, centre y, half width, half depth).
COAT = [
    (0.70, 0.000, 0.222, 0.165), (0.78, 0.000, 0.218, 0.162), (0.90, 0.000, 0.210, 0.158),
    (1.02, 0.000, 0.200, 0.156), (1.14, 0.000, 0.205, 0.160), (1.22, 0.000, 0.215, 0.158),
    (1.30, 0.015, 0.210, 0.155), (1.36, 0.030, 0.190, 0.150), (1.42, 0.040, 0.140, 0.120),
]
COAT_EXP = 2.6
HEM = 0.70


def superellipse(angle, exp):
    c, s = math.cos(angle), math.sin(angle)
    return (math.copysign(abs(c) ** (2 / exp), c), math.copysign(abs(s) ** (2 / exp), s))


def resample(keys, step):
    """Linearly interpolate key sections so rings are at most `step` apart."""
    out = [keys[0]]
    for a, b in zip(keys, keys[1:]):
        count = max(1, math.ceil(abs(b[0] - a[0]) / step))
        for i in range(1, count + 1):
            t = i / count
            out.append(tuple(x + (y - x) * t for x, y in zip(a, b)))
    return out


def axis_point(axis, t, p1, p2):
    return {'z': (p1, p2, t), 'x': (t, p1, p2), 'y': (p1, t, p2)}[axis]


def interpolate(keys, z):
    """Section parameters at z, clamped to the first and last key."""
    if z <= keys[0][0]:
        return keys[0][1:]
    for a, b in zip(keys, keys[1:]):
        if z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return tuple(x + (y - x) * t for x, y in zip(a[1:], b[1:]))
    return keys[-1][1:]


def coat_front(x, z):
    """Y of the coat's front surface at (x, z); patches are built against it."""
    cy, hw, hd = interpolate(COAT, z)
    u = min(abs(x) / hw, 0.999)
    return cy - hd * (1 - u ** COAT_EXP) ** (1 / COAT_EXP)


def smooth(edge0, edge1, x):
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def chain(value, anchors):
    """Blend between the two anchor bones around `value`; anchors are (value, bone)."""
    if value <= anchors[0][0]:
        return {anchors[0][1]: 1.0}
    for (a, bone_a), (b, bone_b) in zip(anchors, anchors[1:]):
        if value <= b:
            t = (value - a) / (b - a)
            weights = {bone_a: 1 - t}
            weights[bone_b] = weights.get(bone_b, 0) + t
            return weights
    return {anchors[-1][1]: 1.0}


class Mesh:
    def __init__(self):
        self.verts, self.faces, self.materials, self.weights = [], [], [], []
        self.parts = {}

    def add(self, name, rings, material, weigh, jitter, caps=(True, True), closed=False, face_material=None):
        rng = random.Random(f'{SEED}:{name}')
        base = len(self.verts)
        n = len(rings[0])
        for ring in rings:
            for p in ring:
                q = tuple(c + rng.uniform(-jitter, jitter) for c in p)
                self.verts.append(q)
                self.weights.append(weigh(p))
        count = len(rings) if closed else len(rings) - 1
        first_face = len(self.faces)
        for i in range(count):
            a, b = base + i * n, base + ((i + 1) % len(rings)) * n
            for j in range(n):
                k = (j + 1) % n
                self.faces.append((a + j, a + k, b + k, b + j))
        if not closed:
            for index, cap in ((0, caps[0]), (len(rings) - 1, caps[1])):
                if not cap:
                    continue
                ring = rings[index]
                centre = tuple(sum(p[c] for p in ring) / n for c in range(3))
                self.verts.append(centre)
                self.weights.append(weigh(centre))
                hub = len(self.verts) - 1
                start = base + index * n
                for j in range(n):
                    self.faces.append((start + j, start + (j + 1) % n, hub))
        for f in range(first_face, len(self.faces)):
            chosen = face_material(self.faces[f], self.verts) if face_material else None
            self.materials.append(chosen or material)
        self.parts[name] = (base, len(self.verts))

    def tube(self, name, keys, axis, material, weigh, n=12, exp=2.2, step=0.04, jitter=0.004, **kw):
        rings = []
        for t, c1, c2, r1, r2 in resample(keys, step):
            ring = []
            for j in range(n):
                u, v = superellipse(2 * math.pi * j / n, exp)
                ring.append(axis_point(axis, t, c1 + r1 * u, c2 + r2 * v))
            rings.append(ring)
        self.add(name, rings, material, weigh, jitter, **kw)
        return rings

    def loop(self, name, path, radius, material, weigh, segments=7, jitter=0.01, centre=None):
        """A capped tube along an open path, used for the fur ruff and collar.

        `radius` is one value, or (across, deep): across lies in the path's plane
        and deep is perpendicular to it.
        """
        across, deep = radius if isinstance(radius, tuple) else (radius, radius)
        rings, count = [], len(path)
        centre = centre or [sum(p[c] for p in path) / count for c in range(3)]
        for i, p in enumerate(path):
            nxt, prv = path[min(i + 1, count - 1)], path[max(i - 1, 0)]
            tangent = norm(sub(nxt, prv))
            outward = norm(sub(p, centre))
            binormal = norm(cross(tangent, outward))
            normal = cross(binormal, tangent)
            ring = []
            for j in range(segments):
                a = 2 * math.pi * j / segments
                ring.append(tuple(p[c] + across * math.cos(a) * normal[c] + deep * math.sin(a) * binormal[c]
                                  for c in range(3)))
            rings.append(ring)
        self.add(name, rings, material, weigh, jitter)

    def patch(self, name, x0, x1, z0, z1, raised, material, weigh, columns=4, rows=3, jitter=0.002, tilt=0.0):
        """A box lying on the coat's front surface: pockets, flaps and the zip placket."""
        rng = random.Random(f'{SEED}:{name}')
        base = len(self.verts)
        grid = []
        for layer, depth in enumerate((0.012, -raised)):
            for r in range(rows + 1):
                z = z0 + (z1 - z0) * r / rows
                for c in range(columns + 1):
                    x = x0 + (x1 - x0) * c / columns
                    lift = tilt * (r / rows) if layer else 0
                    p = (x, coat_front(x, z) + depth - lift, z)
                    self.verts.append(tuple(v + rng.uniform(-jitter, jitter) for v in p))
                    self.weights.append(weigh(p))
        cols = columns + 1
        layer_size = cols * (rows + 1)

        def at(layer, r, c):
            return base + layer * layer_size + r * cols + c

        faces = []
        for r in range(rows):
            for c in range(columns):
                faces.append((at(1, r, c), at(1, r, c + 1), at(1, r + 1, c + 1), at(1, r + 1, c)))
                faces.append((at(0, r, c), at(0, r + 1, c), at(0, r + 1, c + 1), at(0, r, c + 1)))
        for r in range(rows):
            faces.append((at(0, r, 0), at(1, r, 0), at(1, r + 1, 0), at(0, r + 1, 0)))
            faces.append((at(0, r, columns), at(0, r + 1, columns), at(1, r + 1, columns), at(1, r, columns)))
        for c in range(columns):
            faces.append((at(0, 0, c), at(0, 0, c + 1), at(1, 0, c + 1), at(1, 0, c)))
            faces.append((at(0, rows, c), at(1, rows, c), at(1, rows, c + 1), at(0, rows, c + 1)))
        self.faces.extend(faces)
        self.materials.extend([material] * len(faces))
        self.parts[name] = (base, len(self.verts))


def spline(points, per_segment):
    """Catmull-Rom points through `points`, `per_segment` samples between each pair."""
    out = []
    padded = [points[0]] + list(points) + [points[-1]]
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1:i + 3]
        for k in range(per_segment):
            t = k / per_segment
            out.append(tuple(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t
                                    + (-a + 3 * b - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(points[-1])
    return out


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    length = math.sqrt(sum(x * x for x in a)) or 1.0
    return tuple(x / length for x in a)


# Skin weights. Each returns {bone: weight} for a rest-pose point.

def torso_weights(p):
    x, y, z = p
    weights = chain(z, [(0.90, 'Hips'), (1.06, 'Spine'), (1.18, 'Chest'), (1.30, 'UpperChest'), (1.42, 'Neck')])
    # The skirt below the hips follows each thigh a little, more toward the hem,
    # so a striding knee pushes the parka instead of passing through it.
    # The back panel follows less, so a trailing thigh does not balloon it.
    skirt = smooth(0.92, HEM, z) * (0.55 if y < 0 else 0.22)
    if skirt > 0:
        left = skirt * min(1.0, max(0.0, 0.5 + x / 0.16))
        weights = {bone: w * (1 - skirt) for bone, w in weights.items()}
        weights['LeftUpperLeg'] = left
        weights['RightUpperLeg'] = skirt - left
    # The upper sides follow the shoulders as the arms come down.
    shoulder = smooth(0.13, 0.21, abs(x)) * smooth(1.16, 1.28, z) * 0.6
    if shoulder > 0:
        side = 'Left' if x > 0 else 'Right'
        weights = {bone: w * (1 - shoulder) for bone, w in weights.items()}
        weights[f'{side}Shoulder'] = weights.get(f'{side}Shoulder', 0) + shoulder
    return weights


def arm_weights(p):
    side = 'Left' if p[0] > 0 else 'Right'
    return chain(abs(p[0]), [
        (0.14, 'UpperChest'), (0.20, f'{side}Shoulder'), (0.27, f'{side}UpperArm'),
        (0.40, f'{side}UpperArm'), (0.47, f'{side}LowerArm'), (0.62, f'{side}LowerArm'),
        (0.68, f'{side}Hand'),
    ])


def leg_weights(p):
    side = 'Left' if p[0] > 0 else 'Right'
    return chain(-p[2], [
        (-1.00, 'Hips'), (-0.86, f'{side}UpperLeg'), (-0.54, f'{side}UpperLeg'),
        (-0.43, f'{side}LowerLeg'), (-0.15, f'{side}LowerLeg'), (-0.09, f'{side}Foot'),
    ])


def foot_weights(p):
    side = 'Left' if p[0] > 0 else 'Right'
    if p[2] > 0.16:
        return leg_weights(p)
    return chain(-p[1], [(-0.02, f'{side}Foot'), (0.07, f'{side}Foot'), (0.12, f'{side}Toes')])


def head_weights(p):
    return chain(p[2], [(1.40, 'Neck'), (1.48, 'Head')])


def collar_weights(p):
    return {'Neck': 0.6, 'UpperChest': 0.4}


def shape():
    mesh = Mesh()
    coat_keys = [(z, 0.0, cy, hw, hd) for z, cy, hw, hd in COAT]
    mesh.tube('coat', coat_keys, 'z', 'Parka', torso_weights, n=16, exp=COAT_EXP, step=0.065, jitter=0.006)
    mesh.patch('placket', -0.006, 0.034, HEM + 0.005, 1.38, 0.010, 'Parka', torso_weights, columns=1, rows=5)
    for s in (1, -1):
        lo, hi = sorted((s * 0.05, s * 0.19))
        mesh.patch(f'pocket{s}', lo, hi, 0.745, 0.905, 0.024, 'Parka', torso_weights, columns=3, rows=2)
        flo, fhi = sorted((s * 0.042, s * 0.198))
        mesh.patch(f'flap{s}', flo, fhi, 0.885, 0.955, 0.030, 'Parka', torso_weights, columns=3, rows=1, tilt=-0.008)

    # The stand collar is seen only inside the face opening, where the sheets are black.
    mesh.tube('collar', [(1.35, 0, 0.012, 0.118, 0.105), (1.47, 0, 0.012, 0.112, 0.100)], 'z',
              'Void', collar_weights, n=14)

    for s in (1, -1):
        sleeve = [(0.15, 0, 1.270, 0.095, 0.110), (0.24, 0, 1.288, 0.086, 0.092), (0.38, 0, 1.295, 0.078, 0.078),
                  (0.50, 0, 1.290, 0.070, 0.069), (0.60, 0, 1.285, 0.064, 0.064), (0.615, 0, 1.284, 0.070, 0.070),
                  (0.655, 0, 1.282, 0.070, 0.070)]
        mesh.tube(f'sleeve{s}', [(s * t, *rest) for t, *rest in sleeve], 'x', 'Parka', arm_weights,
                  n=10, exp=2.1, step=0.07, jitter=0.005)
        palm = [(0.645, 0, 1.274, 0.054, 0.050), (0.69, 0, 1.270, 0.058, 0.048),
                (0.745, 0, 1.262, 0.056, 0.040), (0.775, 0, 1.256, 0.052, 0.034)]
        mesh.tube(f'palm{s}', [(s * t, *rest) for t, *rest in palm], 'x', 'Accent', arm_weights, n=8, step=0.05)
        for i, dy in enumerate((-0.033, -0.011, 0.011, 0.033)):
            reach = 0.845 if abs(dy) < 0.02 else 0.83
            finger = [(0.765, dy, 1.254, 0.0135, 0.025), (reach, dy * 1.08, 1.232, 0.012, 0.019)]
            mesh.tube(f'finger{s}{i}', [(s * t, *rest) for t, *rest in finger], 'x', 'Accent', arm_weights,
                      n=6, step=0.05, jitter=0.002)
        thumb = [(-0.035, s * 0.700, 1.258, 0.021, 0.021), (-0.090, s * 0.738, 1.236, 0.017, 0.017)]
        mesh.tube(f'thumb{s}', thumb, 'y', 'Accent', arm_weights, n=6, step=0.05, jitter=0.002)

        cx = s * 0.105
        # The hems bunch over the boot tops.
        trousers = [(0.315, cx, 0.005, 0.092, 0.100), (0.36, cx, 0, 0.094, 0.100), (0.42, cx, 0, 0.088, 0.093),
                    (0.50, cx, 0, 0.085, 0.092), (0.60, cx, 0, 0.087, 0.100), (0.72, cx, 0, 0.093, 0.103),
                    (0.85, cx, 0, 0.100, 0.100), (0.98, cx, 0, 0.108, 0.105)]
        mesh.tube(f'trousers{s}', trousers, 'z', 'Trousers', leg_weights, n=10, step=0.07, jitter=0.005)
        shaft = [(0.05, cx, 0.01, 0.066, 0.087), (0.20, cx, 0.01, 0.068, 0.084),
                 (0.30, cx, 0.01, 0.080, 0.088), (0.345, cx, 0.01, 0.084, 0.092)]
        mesh.tube(f'shaft{s}', shaft, 'z', 'Boots', foot_weights, n=10, step=0.08, jitter=0.004)
        foot = [(0.095, cx, 0.050, 0.050, 0.050), (0.06, cx, 0.068, 0.060, 0.068), (-0.02, cx, 0.068, 0.062, 0.066),
                (-0.10, cx, 0.068, 0.061, 0.066), (-0.16, cx, 0.062, 0.055, 0.058), (-0.195, cx, 0.055, 0.040, 0.045)]
        mesh.tube(f'boot{s}', foot, 'y', 'Boots', foot_weights, n=10, exp=3.0, step=0.06, jitter=0.003)
        # A flared sole under the whole boot.
        sole = [(0.100, cx, 0.013, 0.054, 0.013), (0.0, cx, 0.013, 0.065, 0.013), (-0.15, cx, 0.015, 0.062, 0.014),
                (-0.200, cx, 0.020, 0.045, 0.015)]
        mesh.tube(f'sole{s}', sole, 'y', 'Boots', foot_weights, n=8, exp=3.0, step=0.1, jitter=0.002)

    # The hood sits inside the fur collar at the back of the neck, as on the back sheet.
    hood = [(1.42, 0, 0.000, 0.125, 0.120), (1.50, 0, 0.000, 0.148, 0.128), (1.56, 0, 0.000, 0.152, 0.135),
            (1.61, 0, -0.008, 0.135, 0.140), (1.66, 0, -0.018, 0.088, 0.115), (1.69, 0, -0.025, 0.048, 0.060)]
    rings = []
    for z, cx, cy, hw, hd in resample(hood, 0.045):
        ring = []
        for j in range(18):
            angle = 2 * math.pi * j / 18
            u, v = superellipse(angle, 2.2)
            x, y = cx + hw * u, cy + hd * v
            # Recess the face opening inside the ruff so it reads as a dark void.
            front = max(0.0, -v) * smooth(0.35, 0.75, -v) * smooth(1.40, 1.46, z) * (1 - smooth(1.61, 1.66, z))
            if abs(x) < 0.12:
                y += 0.075 * front
            ring.append((x, y, z))
        rings.append(ring)

    def void_face(face, verts):
        points = [verts[i] for i in face]
        cx = sum(p[0] for p in points) / len(points)
        cz = sum(p[2] for p in points) / len(points)
        cy = sum(p[1] for p in points) / len(points)
        inside = (cx / 0.115) ** 2 + ((cz - 1.52) / 0.135) ** 2 < 1.0
        return 'Void' if inside and cy < 0.0 else None

    mesh.add('hood', rings, 'Parka', head_weights, 0.006, caps=(False, True), face_material=void_face)

    # The ruff frames the face from brow to collar and stays open under the chin,
    # leaving an 18 x 23 cm dark opening as on the sheets.
    # Its lower ends flare onto the shoulders, where the collar fur takes over.
    side = [(0.0, -0.130, 1.655), (0.07, -0.125, 1.635), (0.11, -0.110, 1.580), (0.12, -0.100, 1.520),
            (0.12, -0.090, 1.470), (0.135, -0.070, 1.430), (0.16, -0.040, 1.405)]
    ruff = [(-x, y, z) for x, y, z in reversed(side[1:])] + side
    # Deeper than it is wide, so it reads as a broad band from the side.
    mesh.loop('ruff', spline(ruff, 3), (0.030, 0.046), 'Fur', head_weights, segments=6, jitter=0.006,
              centre=(0, -0.1, 1.53))
    # The collar wraps the back of the neck, higher there than at the front, open at the zip.
    collar = []
    for i in range(19):
        t = 1.1 + (2 * math.pi - 2.2) * i / 18
        collar.append((0.14 * math.sin(t), 0.03 - 0.12 * math.cos(t), 1.45 - 0.035 * math.cos(t)))
    mesh.loop('fur_collar', collar, 0.037, 'Fur', collar_weights, segments=6, jitter=0.008, centre=(0, 0.03, 1.45))
    return mesh
