"""
materials.py — the material library of Bellrock.

Everything the tower is built from is described here as a *height field*
first. Height is the honest primitive: colour, roughness and ambient
occlusion are all consequences of how deep a pit is, and a pit is the one
thing this library is good at describing.

Height fields are tileable by construction — every noise sample is taken
from a lattice whose indices wrap at the tile boundary — so the same 1024
px square can repeat across a forty-metre wall without a seam.

Run with:  blender --background --python tools/blender/materials.py
"""

import math
import os
import struct
import zlib

import numpy as np

SIZE = 1024
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "art", "maps")


# ---------------------------------------------------------------------------
#  tileable noise
# ---------------------------------------------------------------------------

def lattice(freq, rng):
    """A `freq` x `freq` grid of white noise that repeats every `freq` cells."""
    return rng.random((freq, freq)).astype(np.float32)


def sample(lat, u, v):
    """Smoothly interpolate a lattice at arbitrary (tileable) coordinates.

    u and v are in lattice units; fractional part is interpolated with a
    smoothstep so the result has no visible derivative breaks, and integer
    part is taken modulo the lattice size so the result wraps.
    """
    f = lat.shape[0]
    u0 = np.floor(u)
    v0 = np.floor(v)
    fu = u - u0
    fv = v - v0
    fu = fu * fu * (3.0 - 2.0 * fu)
    fv = fv * fv * (3.0 - 2.0 * fv)
    iu = u0.astype(np.int32) % f
    iv = v0.astype(np.int32) % f
    iu1 = (iu + 1) % f
    iv1 = (iv + 1) % f
    a = lat[iv, iu]
    b = lat[iv, iu1]
    c = lat[iv1, iu]
    d = lat[iv1, iu1]
    top = a + (b - a) * fu
    bot = c + (d - c) * fu
    return top + (bot - top) * fv


def _coords(size, freq):
    """A pair of coordinate grids spanning [0, freq) across the tile, x and y."""
    t = np.arange(size, dtype=np.float32) * (freq / float(size))
    return (np.broadcast_to(t[None, :], (size, size)),
            np.broadcast_to(t[:, None], (size, size)))


def noise(size, freq, rng, octaves=1, gain=0.5, lac=2):
    """Tileable fractal noise in [0, 1]."""
    out = np.zeros((size, size), np.float32)
    amp = 1.0
    tot = 0.0
    f = freq
    for _ in range(octaves):
        u, v = _coords(size, f)
        out += amp * sample(lattice(f, rng), u, v)
        tot += amp
        amp *= gain
        f *= lac
    return out / tot


def fbm(size, freq, rng, octaves=5, gain=0.5):
    return noise(size, freq, rng, octaves, gain)


def warped(size, freq, rng, strength=0.6, octaves=5):
    """Domain-warped fbm — gives stone its flowing, water-worn grain."""
    wx = fbm(size, freq, rng, 3) - 0.5
    wy = fbm(size, freq, rng, octaves=3) - 0.5
    u, v = _coords(size, freq)
    return sample(lattice(freq * 2, rng),
                  (u + wx * freq * strength) * 2.0,
                  (v + wy * freq * strength) * 2.0)


def ridged(size, freq, rng, octaves=4):
    """Ridged noise — the hard creases where stone has split or flaked."""
    n = fbm(size, freq, rng, octaves)
    return 1.0 - np.abs(n * 2.0 - 1.0)


def hash2(ix, iy, seed=0):
    """Deterministic per-cell random value in [0, 1)."""
    a = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263
         + np.int64(seed) * 2654435761) & 0xFFFFFFFF
    a = ((a ^ (a >> 13)) * 1274126177) & 0xFFFFFFFF
    a = a ^ (a >> 16)
    return (a & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)


# ---------------------------------------------------------------------------
#  geometry fields
# ---------------------------------------------------------------------------

def voronoi(size, cells, rng, jitter=0.85):
    """
    Tileable jittered-grid Voronoi.

    Returns (edge, slab tone, cell id) where `edge` is F2 - F1 — zero exactly
    on the boundary between two cells and largest at a cell's centre. Note
    that F1 alone is *smallest* in the middle of a slab, so it is the wrong
    quantity to threshold a joint from.

    Each pixel only needs to test the nine lattice cells around it, and the
    neighbour is pulled into range by wrapping the delta rather than the
    feature point, which keeps the whole thing seamless.
    """
    cs = size / float(cells)
    pxw = (np.arange(cells)[None, :] + (rng.random((cells, cells)) - 0.5) * jitter) * cs
    pyw = (np.arange(cells)[:, None] + (rng.random((cells, cells)) - 0.5) * jitter) * cs
    pxw = pxw.astype(np.float32)
    pyw = pyw.astype(np.float32)

    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    axis = np.arange(size, dtype=np.int32)
    cell_i = ((axis * cells) // size) % cells
    cell_j = ((axis * cells) // size) % cells

    f1 = np.full((size, size), 1e12, np.float32)
    f2 = np.full((size, size), 1e12, np.float32)
    cid = np.zeros((size, size), np.int32)

    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            ci = (cell_i[None, :] + ox) % cells
            cj = (cell_j[:, None] + oy) % cells
            dx = pxw[cj, ci] - xx
            dy = pyw[cj, ci] - yy
            dx -= size * np.round(dx / size)
            dy -= size * np.round(dy / size)
            d2 = dx * dx + dy * dy

            nxt = np.minimum(f1, d2)
            f2 = np.where(d2 < f1, f1, np.minimum(f2, d2))
            f1 = nxt
            cid = np.where(d2 == nxt, cj * cells + ci, cid)

    return np.sqrt(f2) - np.sqrt(f1), cid


def horizon_ao(height, dirs=10, steps=20, dist=0.10, strength=1.0):
    """
    Directional horizon-scan ambient occlusion.

    For each of `dirs` compass directions, march outward and keep the
    steepest upward slope seen; a surface that can see a lot of sky in
    every direction is open, one that is walled in by its own relief is not.
    Cheaper and far more predictable than ray-tracing, and because it wraps
    it is exactly tileable.
    """
    acc = np.zeros_like(height)
    for d in range(dirs):
        a = 2.0 * math.pi * (d + 0.5) / dirs
        dx = int(round(math.cos(a)))
        dy = int(round(math.sin(a)))
        if dx == 0 and dy == 0:
            continue
        best = np.zeros_like(height)
        for s in range(1, steps + 1):
            dd = dist * s / steps
            hs = np.roll(np.roll(height, -dy * s, axis=0), -dx * s, axis=1)
            dh = hs - height
            best = np.maximum(best, dh / np.sqrt(dd * dd + dh * dh + 1e-9))
        acc += np.clip(1.0 - best * strength, 0.0, 1.0)
    return acc / dirs


def streaky(size, freq, rng, stretch=7.0):
    """Noise stretched vertically — the shape water makes when it runs down a wall."""
    u, v = _coords(size, freq)
    return sample(lattice(freq, rng), u / stretch, v)


def striated(size, freq, rng, along=0.06):
    """
    Noise that varies quickly across a direction and slowly along it — the
    shape of wood grain, and of the drawn-out marks on a turned metal face.

    Thresholding a *striated* field is safe; thresholding a low-frequency
    ridged one is not, because its contour lines wander across the whole tile
    and read as doodles rather than as damage.
    """
    u, v = _coords(size, freq)
    return sample(lattice(freq, rng), u * along, v)


def blur_wrap(a, r):
    """Separable box blur that wraps at the tile edge."""
    if r < 1:
        return a
    k = 2 * r + 1
    acc = np.zeros_like(a)
    for i in range(-r, r + 1):
        acc += np.roll(a, i, axis=1)
    acc /= k
    out = np.zeros_like(a)
    for i in range(-r, r + 1):
        out += np.roll(acc, i, axis=0)
    return out / k


def downsample(a, f):
    """Box-filter down by an integer factor. Exact, and seam-safe on tiles."""
    h, w = a.shape[:2]
    h2, w2 = h // f, w // f
    if a.ndim == 3:
        return a.reshape(h2, f, w2, f, a.shape[2]).mean(axis=(1, 3))
    return a.reshape(h2, f, w2, f).mean(axis=(1, 3))


def normal_from_height(h, tilt=30.0, smooth=2, ref=99.5):
    """
    Tangent-space normal map from a height field (OpenGL / +Y up).

    The height is blurred first. Detail finer than a couple of pixels cannot
    describe a meaningful surface direction at this texel density, but it does
    turn the PNG into noise that costs megabytes to store. The fine grain stays
    in the albedo and the roughness map, where it still reads.

    Rather than exposing a raw gradient gain -- whose useful range differs by
    two orders of magnitude between, say, a 0.4-deep mortar joint and the
    orange-peel of a sand casting -- this takes the tilt of the steepest normal
    in degrees and solves for the gain that produces it. One meaningful number
    per material, and it means what it says.
    """
    h = blur_wrap(h, smooth)
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    slope = np.sqrt(dx * dx + dy * dy)

    p = float(np.percentile(slope, ref))
    k = math.tan(math.radians(tilt)) / max(p, 1e-9)

    nx = -dx * k
    ny = dy * k
    ln = np.sqrt(nx * nx + ny * ny + 1.0)
    out = np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, 1.0 / ln * 0.5 + 0.5], axis=-1)
    t = np.degrees(np.arctan(slope * k))
    print("        tilt target %.0f deg -> mean %.1f  max %.1f" % (tilt, t.mean(), t.max()))
    return out


# ---------------------------------------------------------------------------
#  output
# ---------------------------------------------------------------------------

def _paeth(a, b, c):
    p = a.astype(np.int16) + b.astype(np.int16) - c.astype(np.int16)
    pa = np.abs(p - a.astype(np.int16))
    pb = np.abs(p - b.astype(np.int16))
    pc = np.abs(p - c.astype(np.int16))
    out = np.where((pa <= pb) & (pa <= pc), a, np.where(pb <= pc, b, c))
    return out


def write_png(path, arr):
    """
    Minimal, dependency-free PNG writer for 0..1 float arrays.

    Scanlines are adaptively filtered with the heuristic from the PNG spec —
    trying all five predictors per row and keeping whichever yields the
    smallest sum of absolute differences. Writing every row unfiltered is
    legal but costs roughly an order of magnitude on smooth, low-entropy
    images such as normal maps, where neighbouring pixels are nearly equal.
    """
    a = np.clip(arr, 0.0, 1.0)
    if a.ndim == 2:
        a = np.repeat(a[:, :, None], 3, axis=2)
    a = (a * 255.0 + 0.5).astype(np.uint8)
    h, w, ch = a.shape
    bpp = ch

    raw = bytearray()
    prev = np.zeros((w, ch), np.uint8)
    for y in range(h):
        row = a[y]
        left = np.zeros_like(row)
        left[:, bpp:] = row[:, :-bpp]
        upleft = np.zeros_like(row)
        upleft[bpp:, :] = prev[:-bpp, :]

        cands = [
            row,                                          # 0 None
            (row.astype(np.int16) - left).astype(np.uint8),        # 1 Sub
            (row.astype(np.int16) - prev).astype(np.uint8),        # 2 Up
            ((row.astype(np.int16) - ((left.astype(np.int16)
                                       + prev.astype(np.int16)) // 2)).astype(np.uint8)),  # 3 Average
            (row.astype(np.int16) - _paeth(left, prev, upleft)).astype(np.uint8),        # 4 Paeth
        ]
        best, best_score = 0, None
        for i, c in enumerate(cands):
            s = np.abs(c.view(np.int8).astype(np.int32)).sum()
            if best_score is None or s < best_score:
                best, best_score = i, s
        raw.append(best)
        raw.extend(cands[best].tobytes())
        prev = row

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def emit(name, albedo, height, rough, metal, ao=None, tilt=30.0, size=SIZE):
    """
    Write albedo / normal / ORM for one material.

    ORM is the glTF packing three.js understands directly: R = ambient
    occlusion, G = roughness, B = metalness. One file instead of three.

    Albedo is written at full resolution because the fine grain lives there.
    Normal and ORM go out at half: a normal map describes shape, and its
    finest useful detail at this texel density is far coarser than the albedo
    grain next to it. Halving them costs nothing visible and saves about
    two thirds of the texture payload.
    """
    if ao is None:
        ao = horizon_ao(height)
    os.makedirs(OUT, exist_ok=True)
    nrm = normal_from_height(downsample(height, 2), tilt=tilt, smooth=2)
    orm = downsample(np.stack([ao, rough, metal], axis=-1), 2)
    write_png(os.path.join(OUT, name + "_albedo.png"), albedo)
    write_png(os.path.join(OUT, name + "_normal.png"), nrm)
    write_png(os.path.join(OUT, name + "_orm.png"), orm)

    lum = albedo @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    print("  %-15s albedo %.2f-%.2f (mean %.2f)  rough %.2f  metal %.2f  ao %.2f-%.2f"
          % (name, lum.min(), lum.max(), lum.mean(), rough.mean(), metal.mean(),
             ao.min(), ao.max()))


def tint(f, lo, hi):
    """Map a 0..1 field to a colour ramp given as two RGB triples."""
    lo = np.array(lo, np.float32)
    hi = np.array(hi, np.float32)
    f = np.clip(f, 0.0, 1.0)[:, :, None]
    return lo[None, None, :] * (1.0 - f) + hi[None, None, :] * f


def mul(base, factor):
    """Multiply a colour image by a scalar field of direct multipliers."""
    return base * np.clip(factor, 0.0, None)[:, :, None]


# ---------------------------------------------------------------------------
#  1. ashlar — the coursed wall stone of the tower
# ---------------------------------------------------------------------------

def ashlar(size=SIZE, seed=11):
    rng = np.random.default_rng(seed)
    rows, cols = 6, 3

    v = (np.arange(size, dtype=np.float32) / size)[:, None] * np.ones((1, size), np.float32)
    u = (np.arange(size, dtype=np.float32) / size)[None, :] * np.ones((size, 1), np.float32)

    course = np.floor(v * rows)
    offset = (course % 2) * 0.5
    bu = (u * cols + offset) % 1.0
    bv = v * rows - course

    bi = np.floor(u * cols + offset).astype(np.int64) % cols
    bj = course.astype(np.int64)

    # per-block identity
    tone = hash2(bi, bj, 3)
    lift = hash2(bi, bj, 7)
    tilt = hash2(bi, bj, 11)

    # distance to the nearest joint, in cell units
    dj = np.minimum(bu, 1.0 - bu)
    di = np.minimum(bv, 1.0 - bv)
    joint = np.minimum(dj, di)

    mortar_w = 0.022 + 0.013 * tone          # joints vary; hand-cut stone does
    mortar = 1.0 - np.clip(joint / mortar_w, 0.0, 1.0)
    mortar = mortar * mortar * (3.0 - 2.0 * mortar)
    # the joint wanders a little instead of ruling a perfect line
    mortar = np.clip(mortar * (0.75 + 0.5 * fbm(size, 30, rng, 3)), 0.0, 1.0)
    # pull the joint to a narrow line: a wide ramp is what makes a wall read as
    # deep blockwork rather than a raked joint between flat stones
    mortar = np.power(mortar, 2.2)

    # --- the face of each block -------------------------------------------
    # Structure carries the image; surface detail stays granular and small.
    grit = fbm(size, 170, rng, 2)        # fine tooth, present everywhere
    mid = fbm(size, 44, rng, 4)          # mottle within a single block
    wear = fbm(size, 7, rng, 3)          # slow drift across the whole wall

    # gentle convexity so the middle of a block stands proud of its edges
    bulge = (1.0 - np.clip(joint / 0.5, 0.0, 1.0)) ** 0.6

    face = 0.62 + 0.085 * lift
    face += 0.045 * bulge * (0.7 + 0.6 * tilt)
    face += 0.020 * (wear - 0.5)

    h = face + 0.016 * (mid - 0.5) + 0.009 * (grit - 0.5)
    h -= 0.16 * mortar

    # chipped corners: bite a little relief out of the four corners of a block
    cx = np.minimum(bu, 1.0 - bu)
    cy = np.minimum(bv, 1.0 - bv)
    corner = np.maximum(1.0 - np.clip(cx / 0.16, 0.0, 1.0), 0.0) * \
        np.maximum(1.0 - np.clip(cy / 0.20, 0.0, 1.0), 0.0)
    chip = corner * np.clip(fbm(size, 40, rng, 3) * 1.8 - 0.55, 0.0, 1.0)
    h -= 0.07 * chip

    # --- colour ------------------------------------------------------------
    base = tint(0.20 + 0.62 * tone, (0.470, 0.452, 0.412), (0.690, 0.665, 0.610))
    base = mul(base, 0.93 + 0.13 * hash2(bi, bj, 23))
    base = mul(base, 0.90 + 0.18 * wear)
    base = mul(base, 0.93 + 0.14 * mid)
    base = mul(base, 0.96 + 0.08 * grit)

    # mortar is paler and chalkier than the stone around it
    # Lime mortar weathers *darker* than the stone it beds. Rendering it
    # lighter is what makes coursed stone read as white bathroom tile.
    mortar_col = np.array((0.375, 0.360, 0.330), np.float32)
    mortar_tex = 0.88 + 0.24 * fbm(size, 90, rng, 3)
    base = base * (1.0 - mortar[:, :, None]) + \
        (mortar_col[None, None, :] * mortar_tex[:, :, None]) * mortar[:, :, None]

    # damp bleeding down out of the joints
    # Damp runs down *from a joint*, not down the whole face. Anchoring it to
    # the joints is what stops it banding every course identically.
    fromjoint = np.clip(1.0 - joint / 0.10, 0.0, 1.0)
    streak = np.clip(streaky(size, 30, rng, stretch=5.0) * 1.8 - 0.72, 0.0, 1.0)
    streak *= np.clip(1.0 - (v * 1.5) ** 1.3, 0.0, 1.0)
    streak *= np.clip(fromjoint * 1.6 - 0.25, 0.0, 1.0)
    base *= (1.0 - streak[:, :, None] * 0.30)

    # lichen and salt bloom, only where it can sit — on the mortar and the damp
    lichen = np.clip(fbm(size, 30, rng, 4) * 1.6 - 0.74, 0.0, 1.0) * np.clip(mortar + streak * 0.6, 0.0, 1.0)
    base = base * (1.0 - lichen[:, :, None]) + \
        np.array((0.50, 0.535, 0.405), np.float32)[None, None, :] * lichen[:, :, None]

    ao = horizon_ao(h, strength=1.3)
    base *= (0.70 + 0.30 * ao[:, :, None])

    rough = np.clip(0.90 - 0.10 * (1.0 - streak) - 0.18 * lichen + 0.05 * tone, 0.45, 0.99)
    metal = np.zeros_like(h)
    emit("ashlar", base, h, rough, metal, ao, tilt=33.0, size=size)


# ---------------------------------------------------------------------------
#  2. flagstone — the floor, dry and drowned
# ---------------------------------------------------------------------------

def _flagstone_fields(size, seed, cells=9):
    rng = np.random.default_rng(seed)
    edge, cid = voronoi(size, cells, rng, jitter=0.92)        # 0 on a joint
    slab = hash2(cid % cells, cid // cells, 5)
    slab = np.clip(slab * 0.75 + hash2(cid % cells, cid // cells, 19) * 0.25, 0.0, 1.0)
    return rng, edge, slab, cid


def flagstone(size=SIZE, seed=31, wet=False):
    rng, edge, slab, cid = _flagstone_fields(size, seed)
    cells = 9

    grit = fbm(size, 170, rng, 2)
    mid = fbm(size, 40, rng, 4)
    wear = fbm(size, 6, rng, 3)

    # slabs are flat; only the joint between them is recessed
    joint_w = float(np.percentile(edge, 13.0))
    joint = 1.0 - np.clip(edge / joint_w, 0.0, 1.0)
    joint = np.power(joint * joint * (3.0 - 2.0 * joint), 2.0)

    h = 0.58 + 0.045 * slab + 0.018 * (wear - 0.5)
    h += 0.014 * (mid - 0.5) + 0.008 * (grit - 0.5)
    # a shallow dish in each slab: floors dish from wear and from rain, and a
    # dead-flat floor is what makes a flagstone texture read as a decal
    dish = 1.0 - np.clip(edge / (joint_w * 6.0), 0.0, 1.0)
    h -= 0.045 * dish * dish
    h -= 0.22 * joint

    base = tint(0.12 + 0.85 * slab, (0.360, 0.352, 0.328), (0.780, 0.752, 0.690))
    base = mul(base, 0.92 + 0.16 * wear)
    base = mul(base, 0.94 + 0.12 * mid)
    base = mul(base, 0.97 + 0.06 * grit)

    # grit and mud packed into the joints
    base = base * (1.0 - joint[:, :, None] * 0.52)

    # the middle of the floor has been walked smooth for a century and a bit
    polish = np.clip(wear * 1.5 - 0.45, 0.0, 1.0)
    base = mul(base, 1.0 + polish * 0.14)

    ao = horizon_ao(h, dirs=10, steps=16, dist=0.055, strength=1.2)
    base *= (0.72 + 0.28 * ao[:, :, None])

    if wet:
        # dark, saturated, with standing water lying in the joints
        base *= 0.46
        pool = np.clip(1.0 - wear * 1.6, 0.0, 1.0)
        base = base * (1.0 - pool[:, :, None] * 0.30) + \
            np.array((0.055, 0.085, 0.095), np.float32)[None, None, :] * pool[:, :, None]
        rough = np.clip(0.34 + 0.34 * joint - 0.16 * polish, 0.08, 0.85)
    else:
        rough = np.clip(0.86 + 0.08 * grit - 0.22 * polish + 0.05 * wear, 0.35, 0.99)

    metal = np.zeros_like(h)
    emit("flagstone_wet" if wet else "flagstone", base, h, rough, metal, ao,
         tilt=27.0, size=size)


# ---------------------------------------------------------------------------
#  3. timber — sarking, shutters, the workbench
# ---------------------------------------------------------------------------

def timber(size=SIZE, seed=21):
    rng = np.random.default_rng(seed)
    planks = 5

    v = (np.arange(size, dtype=np.float32) / size)[:, None] * np.ones((1, size), np.float32)
    u = (np.arange(size, dtype=np.float32) / size)[None, :] * np.ones((size, 1), np.float32)

    bi = np.floor(v * planks).astype(np.int64)
    seam = np.abs((v * planks) % 1.0 - 0.5)
    gap = 1.0 - np.clip((0.5 - seam) / 0.030, 0.0, 1.0)

    ptone = hash2(bi, np.zeros_like(bi), 13)
    pwarp = hash2(bi, np.zeros_like(bi), 17)

    # grain: fine lines running the length of the board
    grain = striated(size, 150, rng, along=0.055)
    phase = v * (size / 8.5) + grain * 3.4 + pwarp * 26.0
    rings = 0.5 + 0.5 * np.sin(phase)
    rings = np.power(rings, 0.7)

    fine = fbm(size, 300, rng, 2)
    weather = fbm(size, 15, rng, 3)

    # a couple of knots, with the grain running round them
    knot_h = np.zeros_like(u)
    knot_col = np.zeros_like(u)
    for _ in range(3):
        kx = rng.random() * size
        ky = rng.random() * size
        dx = np.abs(u * size - kx)
        dx = np.minimum(dx, size - dx)
        dy = np.abs(v * size - ky)
        dy = np.minimum(dy, size - dy)
        r = np.sqrt(dx * dx + dy * dy) * np.ones_like(u)
        kr = size * (0.016 + rng.random() * 0.014)
        core = np.clip(1.0 - r / (kr * 2.6), 0.0, 1.0)
        knot_h = np.maximum(knot_h, core)
        knot_col = np.maximum(knot_col, np.clip(1.0 - r / kr, 0.0, 1.0))

    # splits: a handful of fine checks running with the grain
    split = np.clip((striated(size, 110, rng, along=0.025) - 0.94) * 16.0, 0.0, 1.0)
    split *= 0.25 + 0.75 * ptone

    h = 0.60 + 0.05 * ptone
    h += 0.016 * (rings - 0.5) + 0.010 * (grain - 0.5) + 0.008 * (fine - 0.5)
    h += 0.06 * knot_h - 0.03 * knot_col
    h -= 0.05 * split
    h -= 0.45 * gap

    base = tint(0.30 + 0.55 * ptone, (0.180, 0.115, 0.066), (0.455, 0.315, 0.185))
    base = mul(base, 0.90 + 0.18 * rings)
    base = mul(base, 0.95 + 0.10 * grain)
    base = mul(base, 0.97 + 0.06 * fine)

    # silvered, weather-bleached surface
    base = base * (1.0 - weather[:, :, None] * 0.42) + \
        np.array((0.330, 0.318, 0.295), np.float32)[None, None, :] * weather[:, :, None] * 0.5

    base = base * (1.0 - knot_h[:, :, None] * 0.42)
    base = base * (1.0 - split[:, :, None] * 0.60)
    base *= (1.0 - gap[:, :, None] * 0.55)

    ao = horizon_ao(h, strength=1.2)
    base *= (0.62 + 0.38 * ao[:, :, None])

    rough = np.clip(0.86 + 0.08 * fine - 0.10 * weather + 0.04 * ptone, 0.55, 0.99)
    metal = np.zeros_like(h)
    emit("timber", base, h, rough, metal, ao, tilt=25.0, size=size)


# ---------------------------------------------------------------------------
#  4. brass — cast, turned, and a century of hands
# ---------------------------------------------------------------------------

def brass(size=SIZE, seed=5):
    rng = np.random.default_rng(seed)

    # orange-peel of a sand casting
    peel = fbm(size, 60, rng, 4)
    fine = fbm(size, 220, rng, 3)
    scratch = np.clip((striated(size, 230, rng, along=0.5) - 0.965) * 28.0, 0.0, 1.0)

    # where the turning tool cut it, fine concentric chatter
    chat = np.sin(u_of(size) * 2.0 * math.pi * 34.0) * 0.5 + 0.5

    h = 0.55 + 0.045 * (peel - 0.5) + 0.018 * (fine - 0.5)
    h += 0.006 * chat * 0.5
    h -= 0.012 * scratch

    # tarnish and verdigris collect where water sits: in the relief's lows
    verd = np.clip(fbm(size, 9, rng, 5) * 1.5 - 0.56, 0.0, 1.0)
    verd = np.power(verd, 1.4) * np.clip(1.0 - peel * 1.4, 0.0, 1.0)
    finger = np.clip(fbm(size, 18, rng, 3) * 1.4 - 0.45, 0.0, 1.0)

    gold = np.array((0.790, 0.600, 0.225), np.float32)
    dark = np.array((0.330, 0.235, 0.082), np.float32)
    base = tint(0.35 + 0.5 * peel, dark, gold)
    base = mul(base, 1.0 + (fine - 0.5) * 0.18)

    # the green
    base = base * (1.0 - verd[:, :, None]) + \
        np.array((0.165, 0.330, 0.240), np.float32)[None, None, :] * verd[:, :, None]
    # handling polish where thumbs have worn the tarnish back
    base = mul(base, 1.0 + finger * 0.30)
    base = mul(base, 1.0 - scratch * 0.20)

    ao = horizon_ao(h, strength=1.1)
    base *= (0.66 + 0.34 * ao[:, :, None])

    rough = np.clip(0.22 + 0.30 * verd + 0.10 * (1.0 - finger) + 0.08 * peel, 0.12, 0.80)
    metal = np.clip(1.0 - 0.72 * verd, 0.20, 1.0)
    emit("brass", base, h, rough, metal, ao, tilt=11.0, size=size)


def u_of(size):
    return (np.arange(size, dtype=np.float32) / size)[None, :] * np.ones((size, 1), np.float32)


# ---------------------------------------------------------------------------
#  5. iron — wrought, then abandoned
# ---------------------------------------------------------------------------

def iron(size=SIZE, seed=9):
    rng = np.random.default_rng(seed)

    # hammer facets: the soft planes a smith leaves with a flat-faced hammer
    facets = fbm(size, 22, rng, 3)
    scale = fbm(size, 48, rng, 4)
    fine = fbm(size, 240, rng, 2)
    # pitting is shallow and sparse; it should read as tooth, not as pepper
    pit = np.clip((fbm(size, 150, rng, 3) - 0.68) * 3.0, 0.0, 1.0)

    h = 0.55 + 0.070 * (facets - 0.5) + 0.022 * (scale - 0.5) + 0.008 * (fine - 0.5)
    h -= 0.030 * pit

    # Rust grows in coherent blooms. The boundary is perturbed by a mid-
    # frequency field so it wanders like corrosion without dissolving into
    # high-frequency dither.
    # A single-octave warp: extra octaves here put fine detail exactly at the
    # threshold, which turns coherent blooms into a contour-line network.
    bloom = warped(size, 5, rng, strength=0.8, octaves=1)
    rim = fbm(size, 20, rng, 2) - 0.5
    r = np.clip((bloom - 0.605 + rim * 0.15) / 0.155, 0.0, 1.0)
    r = r * r * (3.0 - 2.0 * r)

    # bloom texture, only meaningful once the rust is already there
    grain = 0.90 + 0.20 * fbm(size, 55, rng, 3)
    r = np.clip(r * grain, 0.0, 1.0)
    print("    rust coverage %.0f%%" % (100.0 * float((r > 0.5).mean())))

    dark = np.array((0.145, 0.148, 0.158), np.float32)
    steel = np.array((0.455, 0.462, 0.482), np.float32)
    base = tint(0.30 + 0.55 * facets, dark, steel)
    base = mul(base, 0.94 + 0.12 * scale)
    base = mul(base, 0.97 + 0.06 * fine)

    rust = np.array((0.540, 0.235, 0.090), np.float32)
    base = base * (1.0 - r[:, :, None]) + rust[None, None, :] * r[:, :, None]
    base = mul(base, 1.0 - pit * 0.16)

    ao = horizon_ao(h, strength=1.2)
    base *= (0.62 + 0.38 * ao[:, :, None])

    rough = np.clip(0.44 + 0.34 * r + 0.10 * pit + 0.06 * (1.0 - facets), 0.28, 0.96)
    metal = np.clip(1.0 - 0.90 * r, 0.06, 1.0)
    emit("iron", base, h, rough, metal, ao, tilt=19.0, size=size)


# ---------------------------------------------------------------------------

MATERIALS = {
    "ashlar": lambda: ashlar(),
    "flagstone": lambda: flagstone(wet=False),
    "flagstone_wet": lambda: flagstone(seed=32, wet=True),
    "timber": lambda: timber(),
    "brass": lambda: brass(),
    "iron": lambda: iron(),
}

if __name__ == "__main__":
    import sys
    only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    print("baking %d px PBR sets into %s" % (SIZE, os.path.normpath(OUT)))
    for name, fn in MATERIALS.items():
        if only and name not in only:
            continue
        fn()
    print("done")