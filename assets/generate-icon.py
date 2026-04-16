#!/usr/bin/env python3
"""
Isometric rounded rectangle generator.
Single-shape focus: one extruded rounded rect with proper 3D projection.

Coordinate system (grid units, projected to isometric):
  x-axis → lower-right on screen
  y-axis → lower-left on screen
  z-axis → up on screen

Camera looks from direction (1, 1, 1), so visible side faces are those
whose outward normal has a positive dot product with (1, 1, 0).
"""

import math
import os

# ── Settings ──────────────────────────────────────────────
CANVAS    = 1000
ISO_ANGLE = 30         # degrees
ARC_PTS   = 16         # sample points per quarter-arc
PADDING   = 40         # px margin inside canvas

# UNIT and CENTER are computed from the scene bounding box (see fit_scene())
UNIT      = 1
CENTER    = (0, 0)


# ── Projection ────────────────────────────────────────────

def project(x, y, z):
    """Project 3D grid coords (x, y, z) → 2D isometric canvas (u, v)."""
    a = math.radians(ISO_ANGLE)
    u = (x - y) * math.cos(a) * UNIT + CENTER[0]
    v = ((x + y) * math.sin(a) - z) * UNIT + CENTER[1]
    return (round(u, 2), round(v, 2))


def _raw_project(x, y, z):
    """Project without UNIT/CENTER — returns normalised iso coords."""
    a = math.radians(ISO_ANGLE)
    u = (x - y) * math.cos(a)
    v = (x + y) * math.sin(a) - z
    return (u, v)


def fit_scene(grid_w, grid_h, z_min, z_max):
    """
    Compute UNIT and CENTER so that the full scene fits in CANVAS with PADDING.

    grid_w, grid_h — size of the board in grid units (x and y).
    z_min, z_max   — vertical extent of the scene.
    """
    global UNIT, CENTER

    # Collect all 8 corners of the scene bounding box
    corners = []
    for x in (0, grid_w):
        for y in (0, grid_h):
            for z in (z_min, z_max):
                corners.append(_raw_project(x, y, z))

    umin = min(c[0] for c in corners)
    umax = max(c[0] for c in corners)
    vmin = min(c[1] for c in corners)
    vmax = max(c[1] for c in corners)

    usable = CANVAS - 2 * PADDING
    UNIT = min(usable / (umax - umin), usable / (vmax - vmin))

    umid = (umin + umax) / 2 * UNIT
    vmid = (vmin + vmax) / 2 * UNIT
    CENTER = (CANVAS / 2 - umid, CANVAS / 2 - vmid)


# ── Rounded rectangle outline ────────────────────────────

def _arc(cx, cy, r, start_deg, end_deg):
    """Yield ARC_PTS sample points along a circular arc (endpoint excluded)."""
    for i in range(ARC_PTS):
        a = math.radians(start_deg + (end_deg - start_deg) * i / ARC_PTS)
        yield (cx + r * math.cos(a), cy + r * math.sin(a))


def rounded_rect_outline(cx, cy, w, h, r):
    """
    CCW outline of a rounded rectangle centred at (cx, cy) in the XY plane.

    w, h – full width/height (grid units)
    r    – corner radius (clamped to half the smaller dimension)

    Returns a list of (x, y) tuples tracing the perimeter.
    """
    r = min(r, w / 2, h / 2)
    x0, y0 = cx - w / 2, cy - h / 2          # bottom-left of bounding box
    pts = []
    pts.extend(_arc(x0 + w - r, y0 + r,     r, -90,   0))   # ↘ bottom-right
    pts.extend(_arc(x0 + w - r, y0 + h - r, r,   0,  90))   # ↗ top-right
    pts.extend(_arc(x0 + r,     y0 + h - r, r,  90, 180))   # ↖ top-left
    pts.extend(_arc(x0 + r,     y0 + r,     r, 180, 270))   # ↙ bottom-left
    return pts


# ── Extruded rounded rectangle ───────────────────────────

def _pts_str(pts):
    """Format point list as SVG polygon points attribute value."""
    return " ".join(f"{u},{v}" for u, v in pts)


def iso_rounded_rect(x, y, z, w, h, depth, r, top_color, side_color):
    """
    SVG group for an extruded isometric rounded rectangle.

    All dimensions are in grid units:
      x, y, z    – centre of the top face
      w, h       – width (x-axis) and height (y-axis)
      depth      – extrusion downward along z
      r          – corner radius
      top_color  – hex fill for the top face
      side_color – hex fill for the visible side strip
    """
    outline = rounded_rect_outline(x, y, w, h, r)
    n = len(outline)

    # For a CCW polygon the outward normal of edge p_i → p_{i+1} is (dy, -dx).
    # A vertical side face is visible when normal · (1, 1) > 0  ⟹  dy - dx > 0.
    vis = []
    for i in range(n):
        p1, p2 = outline[i], outline[(i + 1) % n]
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        if dy - dx > 1e-9:
            vis.append(i)

    lines = ["<g>"]

    if vis:
        # Collect the contiguous visible perimeter strip (convex → one arc)
        strip = [outline[i % n] for i in range(vis[0], vis[-1] + 2)]
        top_edge = [project(px, py, z)         for px, py in strip]
        bot_edge = [project(px, py, z - depth) for px, py in strip]
        side_pts = top_edge + list(reversed(bot_edge))
        lines.append(f'  <polygon points="{_pts_str(side_pts)}" fill="{side_color}"/>')

    # Top face (drawn last so it sits on top of the side)
    top = [project(px, py, z) for px, py in outline]
    lines.append(f'  <polygon points="{_pts_str(top)}" fill="{top_color}"/>')

    lines.append("</g>")
    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────

PILL_DEPTH = 0.7
BOARD_DEPTH = 0.7
PILL_R = 0.5
BOARD_R = 1.5
BOARD_Z = BOARD_DEPTH        # top of board
PILL_Z = BOARD_Z + PILL_DEPTH  # top of pills sitting on board
LIFT = 2 * PILL_DEPTH         # how far C is lifted above the board
LIFTED_Z = PILL_Z + LIFT      # top of lifted pill C


def main():
    # Auto-fit the 9×9 board (z goes from 0 to LIFTED_Z)
    fit_scene(9, 9, 0, LIFTED_Z)

    # Grid origin (0,0) = top-left of the 9×9 grid.
    # Pill positions are centres derived from the layout grid.
    #
    # Layout (top-down, row=y, col=x):
    #   · · · · · · · · ·
    #   · C C C C · B B ·    C = 4×4, B1 = 2×4 (vertical)
    #   · C C C C · B B ·
    #   · C C C C · B B ·
    #   · C C C C · B B ·
    #   · · · · · · · · ·
    #   · B B B B · A A ·    B2 = 4×2 (horizontal), A = 2×2
    #   · B B B B · A A ·
    #   · · · · · · · · ·

    board = iso_rounded_rect(
        x=4.5, y=4.5, z=BOARD_Z,
        w=9, h=9,
        depth=BOARD_DEPTH,
        r=BOARD_R,
        top_color="#ffffff",
        side_color="#c4c9d4",
    )

    # Shadow: flat footprint of C on the board surface
    shadow_c = iso_rounded_rect(
        x=3, y=3, z=BOARD_Z + 0.001,
        w=4, h=4,
        depth=0,
        r=PILL_R,
        top_color="#d1d5db",
        side_color="#d1d5db",
    )

    # C: 4×4, lifted 2 pill heights above the board
    pill_c = iso_rounded_rect(
        x=3, y=3, z=LIFTED_Z,
        w=4, h=4,
        depth=PILL_DEPTH,
        r=PILL_R,
        top_color="#4f6ef7",
        side_color="#3b53b8",
    )

    # B1: 2×4 (vertical) at grid cols 6–7, rows 1–4 → centre (7, 3)
    pill_b1 = iso_rounded_rect(
        x=7, y=3, z=PILL_Z,
        w=2, h=4,
        depth=PILL_DEPTH,
        r=PILL_R,
        top_color="#fb923c",
        side_color="#c2702e",
    )

    # B2: 4×2 (horizontal) at grid cols 1–4, rows 6–7 → centre (3, 7)
    pill_b2 = iso_rounded_rect(
        x=3, y=7, z=PILL_Z,
        w=4, h=2,
        depth=PILL_DEPTH,
        r=PILL_R,
        top_color="#34d399",
        side_color="#27a077",
    )

    # A: 2×2 at grid cols 6–7, rows 6–7 → centre (7, 7)
    pill_a = iso_rounded_rect(
        x=7, y=7, z=PILL_Z,
        w=2, h=2,
        depth=PILL_DEPTH,
        r=PILL_R,
        top_color="#fbbf24",
        side_color="#c2941c",
    )

    # Draw back-to-front: C (back), then B1/B2, then A (front)

    # Debug: print 3D dimensions
    print(f"  UNIT = {UNIT:.2f} px/grid-unit")
    print(f"  CENTER = ({CENTER[0]:.1f}, {CENTER[1]:.1f})")
    print()
    shapes = [
        ("Board", 4.5, 4.5, BOARD_Z, 9, 9, BOARD_DEPTH),
        ("Shadow C", 3, 3, BOARD_Z, 4, 4, 0),
        ("C (4×4 blue, lifted)", 3, 3, LIFTED_Z, 4, 4, PILL_DEPTH),
        ("B1 (2×4 orange)", 7, 3, PILL_Z, 2, 4, PILL_DEPTH),
        ("B2 (4×2 mint)", 3, 7, PILL_Z, 4, 2, PILL_DEPTH),
        ("A (2×2 yellow)", 7, 7, PILL_Z, 2, 2, PILL_DEPTH),
    ]
    for name, cx, cy, zt, w, h, d in shapes:
        x0, x1 = cx - w/2, cx + w/2
        y0, y1 = cy - h/2, cy + h/2
        zbot = zt - d
        print(f"  {name}:")
        print(f"    centre=({cx}, {cy})  x=[{x0}..{x1}]  y=[{y0}..{y1}]")
        print(f"    z=[{zbot}..{zt}]  size=({w}×{h}×{d})")
        # gaps
        print(f"    left edge x={x0}  right edge x={x1}  front edge y={y1}  back edge y={y0}")
        print()

    svg = "\n".join([
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg width="{CANVAS}" height="{CANVAS}" viewBox="0 0 {CANVAS} {CANVAS}"',
        '     xmlns="http://www.w3.org/2000/svg">',
        f'<rect width="{CANVAS}" height="{CANVAS}" fill="#f1f3f6"/>',
        board,
        shadow_c,
        pill_b1,
        pill_b2,
        pill_a,
        pill_c,
        "</svg>",
    ])

    out = "public/icons/icon.svg"
    with open(out, "w") as f:
        f.write(svg)
    print(f"✓ {out}")

    # Generate all PNG assets from the SVG
    generate_pngs(out)


# ── PNG generation ────────────────────────────────────────

import subprocess
import shutil

PNG_SIZES = [
    ("app-icon-1024.png", 1024),
    ("icon-512.png",       512),
    ("icon-192.png",       192),
    ("apple-touch-icon.png", 180),
    ("favicon-32.png",      32),
    ("favicon-16.png",      16),
]


def generate_pngs(svg_path):
    """Rasterise the SVG to all required PNG sizes using Inkscape."""
    inkscape = shutil.which("inkscape")
    if not inkscape:
        print("⚠ Inkscape not found — skipping PNG generation")
        return

    icon_dir = os.path.dirname(svg_path)
    for name, size in PNG_SIZES:
        out_path = os.path.join(icon_dir, name)
        subprocess.run(
            [inkscape, svg_path,
             "--export-type=png",
             f"--export-filename={out_path}",
             f"--export-width={size}",
             f"--export-height={size}"],
            capture_output=True,
        )
        print(f"✓ {out_path} ({size}×{size})")


if __name__ == "__main__":
    main()
