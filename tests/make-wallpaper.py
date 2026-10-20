#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
"""Draws the wallpaper used by the screenshots (no downloaded pictures): a deep gradient with a soft glow and fine noise."""
import math, random, sys
from PIL import Image

W, H = 1920, 1080
out = sys.argv[1]
random.seed(7)
img = Image.new('RGB', (W, H))
px = img.load()
cx, cy = W * 0.68, H * 0.38
cx2, cy2 = W * 0.22, H * 0.85
for y in range(H):
    for x in range(W):
        d = math.hypot((x - cx) / W, (y - cy) / H * 1.2)
        glow = max(0.0, 1.0 - d * 1.9) ** 2
        d2 = math.hypot((x - cx2) / W, (y - cy2) / H * 1.2)
        glow2 = max(0.0, 1.0 - d2 * 2.4) ** 2
        base = 14 + 8 * (y / H)
        r = base + 14 * glow + 26 * glow2
        g = base + 30 * glow + 10 * glow2
        b = base + 38 * glow + 30 * glow2 + 4
        n = random.uniform(-1.6, 1.6)
        px[x, y] = (int(max(0, min(255, r + n))), int(max(0, min(255, g + n))), int(max(0, min(255, b + n))))
img.save(out)
