"""The storm-beaten snow pine as plain triangles. Pure Python, so it runs without Blender.

Blender axes: +Z up, +Y north, one unit one metre, origin at the foot of the trunk.
The tree is a trunk carrying whorls of drooping branches. Each branch is a fan of
serrated needle sprigs under one faceted snow slab, as in the owner's sheets.
The storm comes from WIND_FROM: branches facing it are shorter and carry more snow,
and every branch tip is swept a little downwind.
"""
import math
import random

HEIGHT = 6.5
SEED = 'pine-1'
WIND_FROM = (-math.sqrt(0.5), math.sqrt(0.5), 0.0)  # north-west, the town's prevailing wind

# Horizontal reach of a branch whose tip hangs at a height, fitted to the crown
# widths of reference/side.png: a broad skirt, a shoulder near 3.6 m, a narrow spire.
REACH = ((0.0, 1.95), (0.5, 1.95), (1.0, 1.25), (1.5, 1.15), (2.0, 1.02), (2.5, 1.02), (3.0, 1.02),
         (3.5, 1.0), (4.0, 0.72), (4.5, 0.48), (5.0, 0.4), (5.5, 0.13), (6.0, 0.04), (6.5, 0.0))
FIRST_TIER, LAST_TIER = 1.15, 6.25


def add(*vs):
    return tuple(sum(c) for c in zip(*vs))


def mul(v, s):
    return tuple(c * s for c in v)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(v):
    length = math.sqrt(dot(v, v))
    return mul(v, 1 / length)


UP = (0.0, 0.0, 1.0)
DOWNWIND = mul(WIND_FROM, -1)


def reach(height):
    for (h0, r0), (h1, r1) in zip(REACH, REACH[1:]):
        if height <= h1:
            return r0 + (r1 - r0) * max(0.0, height - h0) / (h1 - h0)
    return 0.0


class Mesh:
    def __init__(self):
        self.verts, self.faces, self.materials = [], [], []
        self.noise = random.Random(SEED + '-jitter')

    def add(self, points, faces, material, jitter=0.0):
        base = len(self.verts)
        for p in points:
            self.verts.append(tuple(c + self.noise.uniform(-jitter, jitter) for c in p))
        for face in faces:
            self.faces.append(tuple(base + i for i in face))
            self.materials.append(material)


class Branch:
    """A drooping branch: a curve out from the trunk, swept downwind towards its tip."""

    def __init__(self, height, azimuth, length, pitch, drop, sweep, origin=(0.0, 0.0, 0.0)):
        self.height, self.length, self.pitch, self.drop = height, length, pitch, drop
        self.origin = origin
        self.out = (math.cos(azimuth), math.sin(azimuth), 0.0)
        self.sweep = sweep

    def point(self, t):
        L = self.length
        rise = L * (math.sin(self.pitch) * t - (math.sin(self.pitch) + self.drop / L) * t * t)
        return add(self.origin, mul(self.out, 0.06 + L * t), (0, 0, self.height + rise), mul(DOWNWIND, self.sweep * L * t * t))

    def frame(self, t):
        """Tangent, sideways (left) and branch-up directions at t."""
        a, b = self.point(max(0.0, t - 0.02)), self.point(min(1.0, t + 0.02))
        tangent = unit(add(b, mul(a, -1)))
        side = unit(cross(UP, tangent))
        return tangent, side, cross(tangent, side)


def sprig(mesh, root, direction, normal, length, teeth):
    """A needle sprig: a pointed leaf folded along its midrib, its serrations pointing
    towards its tip as in the sheets. 4 * teeth + 2 triangles."""
    across = cross(normal, direction)
    width = 0.3 * length

    def at(x, y, z):
        return add(root, mul(direction, x * length), mul(across, y * width), mul(normal, z * width))

    def envelope(x):
        return (x / 0.35) ** 0.7 if x < 0.35 else max(0.0, 1 - (x - 0.35) / 0.65) ** 0.9

    points = [at(0, 0, 0), at(0.45, 0, 0.22), at(1, 0, 0)]
    for side in (1, -1):
        for i in range(teeth):
            x = 0.18 + 0.74 * (i + 0.5) / teeth
            for dx, share in ((0.0, 1.0), (-0.05, 0.68)):  # a tooth, then the notch behind it
                y = side * share * envelope(x + dx)
                points.append(at(x + dx, y, -0.25 * abs(y)))
    faces = []
    for first in (3, 3 + 2 * teeth):
        edge = [0] + list(range(first, first + 2 * teeth)) + [2]
        faces += [(a, b, 1) for a, b in zip(edge, edge[1:])]
    mesh.add(points, faces, 'Needles', jitter=0.003)


SNOW_WIDTHS = (0.6, 1.0, 0.92, 0.78, 0.55)  # a tongue's half-width along it, as a share of its widest


def snow_width(length, load):
    """A snow tongue's widest half-width: near the trunk, wide enough to meet its neighbours'."""
    return (0.03 + 0.15 * min(length, 1.4)) * load


def rim(width, t, until):
    """How far out from the branch the snow's edge lies at t (none past the tongue's end)."""
    if t > until:
        return 0.35 * width
    x = t / until * (len(SNOW_WIDTHS) - 1)
    i = min(int(x), len(SNOW_WIDTHS) - 2)
    return width * (SNOW_WIDTHS[i] + (SNOW_WIDTHS[i + 1] - SNOW_WIDTHS[i]) * (x - i))


def needles(mesh, branch, rng, width, snow_until, until=1.0):
    """Rows of sprigs rooted just under the snow's edge on both sides of a branch, hanging
    forward and down as a dark fringe, over a dark tent that keeps the branch solid."""
    L = branch.length
    spread = width
    rows = max(2, round(L * until / 0.19))
    for side in (1, -1):
        for k in range(rows):
            t = 0.1 + (until - 0.1) * (k + rng.uniform(0.3, 0.7)) / rows
            tangent, side_dir, normal = branch.frame(t)
            out = rim(width, t, snow_until) * rng.uniform(0.7, 0.9)
            root = add(branch.point(t), mul(side_dir, side * out), (0, 0, -0.45 * out - 0.02))
            size = (0.17 + 0.22 * min(L, 1.2)) * min(1.0, 0.35 + 1.3 * L) * (1 - 0.3 * t) * rng.uniform(0.85, 1.15)
            forward, droop = math.radians(rng.uniform(20, 45)), math.radians(rng.uniform(35, 55) + 15 * t)
            flat = add(mul(tangent, math.cos(forward)), mul(side_dir, side * math.sin(forward)))
            direction = unit(add(mul(flat, math.cos(droop)), (0, 0, -math.sin(droop))))
            up = unit(add(UP, mul(direction, -dot(UP, direction))))
            sprig(mesh, root, direction, up, size, 3 if size > 0.16 else 2)
    tangent, side_dir, _ = branch.frame(until)
    for turn in (-0.35, 0.35):
        direction = unit(add(tangent, mul(side_dir, turn), (0, 0, -0.3)))
        up = unit(add(UP, mul(direction, -dot(UP, direction))))
        sprig(mesh, branch.point(until), direction, up, 0.07 + 0.16 * min(L, 1.2), 3 if L > 0.6 else 2)
    # The dark tent under the branch.
    points = []
    end = min(until, snow_until)  # past the snow the tent would show from above
    for t in (0.0, 0.35 * end, 0.7 * end, end):
        tangent, side_dir, normal = branch.frame(t)
        centre = branch.point(t)
        out = spread * 0.6 * (1 - 0.6 * t)
        points += [centre, add(centre, mul(side_dir, out), (0, 0, -0.6 * out - 0.03)),
                   add(centre, mul(side_dir, -out), (0, 0, -0.6 * out - 0.03))]
    faces = []
    for j in range(3):
        a, b = 3 * j, 3 * (j + 1)
        faces += [(a, a + 1, b + 1, b), (a, b, b + 2, a + 2)]
    mesh.add(points, faces, 'Shadow', jitter=0.01)
    return spread


def slab(mesh, branch, rng, width, load, until, icicles):
    """The snow on a branch: a faceted tongue, widest near the trunk where it meets its
    neighbours' snow, hanging over both sides in pointed lobes and tapering to a tip."""
    L = branch.length
    thick = (0.025 + 0.08 * min(L, 1.4)) * load * rng.uniform(0.8, 1.2)
    widths = SNOW_WIDTHS
    stations = [0.02 + (until - 0.02) * j / 5 for j in range(5)]
    points, rim = [], []
    for j, t in enumerate(stations):
        tangent, side_dir, normal = branch.frame(t)
        centre = branch.point(t)
        th = thick * (1.0 - 0.15 * j / 4)
        points.append(add(centre, mul(normal, 0.03 + th)))
        for side in (1, -1):
            hw = width * widths[j] * rng.uniform(0.8, 1.2)
            lobe = rng.uniform(0.4, 1.2) * th + 0.03 if rng.random() < 0.5 else 0.0  # a hanging point
            shoulder = add(centre, mul(side_dir, side * 0.5 * hw), mul(normal, 0.03 + 0.6 * th), (0, 0, -0.12 * hw))
            edge = add(centre, mul(side_dir, side * hw), mul(normal, 0.03 + 0.25 * th), (0, 0, -0.45 * hw))
            points += [shoulder, edge, add(edge, (0, 0, -0.5 * th - 0.02 - lobe))]
            rim.append(len(points) - 1)
    tangent, _, normal = branch.frame(until)
    points.append(add(branch.point(until), mul(tangent, 0.06 * L), (0, 0, -0.08)))
    tip = len(points) - 1
    faces = []
    for j in range(5):
        a = 7 * j
        for s0 in (1, 4):
            chain = [a, a + s0, a + s0 + 1, a + s0 + 2]
            if j < 4:
                nxt = [c + 7 for c in chain]
                quads = [(chain[i], chain[i + 1], nxt[i + 1], nxt[i]) for i in range(3)]
            else:
                quads = [(chain[i], chain[i + 1], tip) for i in range(3)]
            faces += quads if s0 == 1 else [tuple(reversed(q)) for q in quads]
    faces.append((0, 1, 2, 3, 6, 5, 4))  # the end against the trunk
    mesh.add(points, faces, 'Snow', jitter=0.026)
    # Ice drips under the heaviest slabs, hanging from the rim near the tip.
    for _ in range(icicles):
        hang = points[rng.choice(rim[-4:])]
        r, depth = rng.uniform(0.012, 0.02), rng.uniform(0.07, 0.17)
        ring = [add(hang, (r * math.cos(a), r * math.sin(a), 0.0)) for a in (0.3, 2.4, 4.5)]
        mesh.add(ring + [add(hang, (0, 0, -depth))], [(0, 1, 3), (1, 2, 3), (2, 0, 3)], 'Ice')


def trunk(mesh):
    """A faceted bark column with a root flare; its last metre leans downwind."""
    sides = 7
    levels = [0.0, 0.12, 0.35, 0.9, 1.8, 3.0, 4.2, 5.2, 5.8, 6.15]

    def axis(z):
        lean = max(0.0, z - 5.4) ** 1.6 * 0.12
        return mul(DOWNWIND, lean)

    def radius(z):
        return 0.165 * (1 - z / 6.6) ** 1.1 + 0.012 + 0.05 * max(0.0, 1 - z / 0.3) ** 2

    points = []
    for z in levels:
        centre = add(axis(z), (0, 0, z))
        for i in range(sides):
            a = 2 * math.pi * (i + 0.5 * (levels.index(z) % 2)) / sides
            points.append(add(centre, (radius(z) * math.cos(a), radius(z) * math.sin(a), 0)))
    faces = []
    for k in range(len(levels) - 1):
        for i in range(sides):
            a, b = k * sides + i, k * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    mesh.add(points, faces, 'Bark', jitter=0.008)
    # Three roots splay into the snow.
    rng = random.Random(SEED + '-roots')
    for k in range(3):
        a = 2 * math.pi * k / 3 + rng.uniform(-0.4, 0.4)
        out = (math.cos(a), math.sin(a), 0.0)
        side = cross(UP, out)
        length = rng.uniform(0.22, 0.36)
        ring = []
        for t, z in ((0.0, 0.22), (0.1, 0.0)):
            centre = add(mul(out, 0.1 + t), (0, 0, z))
            ring.append(add(centre, mul(side, 0.04)))
            ring.append(add(centre, mul(side, -0.04)))
        tip = add(mul(out, 0.1 + length), (0, 0, -0.02))
        ring.append(tip)
        mesh.add(ring, [(0, 2, 3, 1), (0, 4, 2), (1, 3, 4), (0, 1, 4)], 'Bark', jitter=0.01)
    return axis


def spire(mesh, axis):
    """The leader above the last whorl: a needle spike with a snow-capped tip."""
    def ring(z, r, sides=5):
        centre = add(axis(z), (0, 0, z))
        return [add(centre, (r * math.cos(a), r * math.sin(a), 0)) for a in (2 * math.pi * i / sides for i in range(sides))]

    top = add(axis(HEIGHT + 0.2), (0, 0, HEIGHT))
    mesh.add(ring(5.8, 0.06) + ring(6.15, 0.04), [(i, (i + 1) % 5, 5 + (i + 1) % 5, 5 + i) for i in range(5)],
             'Needles', jitter=0.004)
    mesh.add(ring(6.1, 0.05) + [top], [(i, (i + 1) % 5, 5) for i in range(5)], 'Snow', jitter=0.004)


def shadow(mesh):
    """Dark needles filling the crown's core, so the gaps between whorls read as depth."""
    sides, rings = 9, [0.95, 1.6, 2.4, 3.4, 4.4, 5.3, 6.05]
    rng = random.Random(SEED + '-shadow')
    points = []
    for z in rings:
        for i in range(sides):
            a = 2 * math.pi * (i + 0.5 * (rings.index(z) % 2)) / sides
            r = 0.36 * reach(z) * rng.uniform(0.8, 1.15)
            points.append((r * math.cos(a), r * math.sin(a), z - 0.1))
    faces = []
    for k in range(len(rings) - 1):
        for i in range(sides):
            a, b = k * sides + i, k * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    mesh.add(points, faces, 'Shadow', jitter=0.02)


def tiers():
    rng = random.Random(SEED + '-tiers')
    heights, h = [], FIRST_TIER
    while h < LAST_TIER:
        heights.append(h)
        h += (0.2 + 0.36 * (1 - h / HEIGHT)) * rng.uniform(0.85, 1.15)
    return heights


def shape():
    mesh = Mesh()
    axis = trunk(mesh)
    shadow(mesh)
    spire(mesh, axis)
    heights = tiers()
    broken = {(2, 1), (5, 3)}
    stats = {'tiers': len(heights), 'branches': 0, 'stripped': 0, 'broken': len(broken), 'icicles': 0}
    for tier, h in enumerate(heights):
        f = h / HEIGHT
        count = round(4.5 + 3 * (1 - f))
        tier_reach = random.Random(f'{SEED}-tier-{tier}').uniform(0.9, 1.1)
        for i in range(count):
            rng = random.Random(f'{SEED}-{tier}-{i}')
            # Each whorl sits half a step round from the one below, as on a real spruce.
            azimuth = 2 * math.pi * (i + 0.5 * (tier % 2)) / count + 0.3 * tier + rng.uniform(-0.2, 0.2)
            out = (math.cos(azimuth), math.sin(azimuth), 0.0)
            windward = dot(out, WIND_FROM)
            drop_share = (0.55 - 0.2 * f) * rng.uniform(0.85, 1.15)
            L = max(0.14, reach(h - 0.6 * drop_share * reach(h)) * tier_reach * rng.uniform(0.75, 1.05) * (1 - 0.04 * windward))
            drop = min(drop_share * L, h - 0.3)
            pitch = math.radians(6 * f - 4 + rng.uniform(-4, 4))
            z = h + rng.uniform(-0.08, 0.08) * (1 - f)
            branch = Branch(z, azimuth, L, pitch, drop, 0.04, axis(z))
            stats['branches'] += 1
            if (tier, i) in broken:
                # Snapped by the storm: half its length, a bare splintered end.
                branch.length *= 0.5
                width = snow_width(branch.length, 0.9)
                needles(mesh, branch, rng, width, 0.7, until=0.7)
                slab(mesh, branch, rng, width, 0.9, 0.7, 0)
                end, (tangent, side, normal) = branch.point(0.72), branch.frame(0.72)
                stick = add(end, mul(tangent, 0.28), (0, 0, -0.05))
                mesh.add([add(end, mul(side, 0.025)), add(end, mul(side, -0.025)), add(end, mul(normal, 0.03)), stick],
                         [(0, 1, 3), (1, 2, 3), (2, 0, 3)], 'Bark')
                continue
            load = rng.uniform(0.8, 1.15) * (1 + 0.3 * max(0.0, windward)) * (0.7 + 0.4 * (1 - f))
            stripped = rng.random() < 0.08
            stats['stripped'] += stripped
            icicles = rng.randrange(0, 3) if load > 1.05 and L > 0.7 else 0
            stats['icicles'] += icicles
            width = snow_width(L, load)
            snow_until = rng.uniform(0.4, 0.55) if stripped else rng.uniform(0.9, 1.0)
            needles(mesh, branch, rng, width, snow_until)
            slab(mesh, branch, rng, width, load, snow_until, icicles)
    return mesh, stats


if __name__ == '__main__':
    built, stats = shape()
    tris = sum(len(f) - 2 for f in built.faces)
    print(stats, 'triangles', tris, 'vertices', len(built.verts))
