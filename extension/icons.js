// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

// SOLID shapes for projects: opaque, with no gaps or inner outlines. Faces are told apart with three real shades
// of the same color (light, base, dark), not with transparency. Pure functions: they produce the text of an SVG.


const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Four shades of the same color.
export function shades(color) {
    const c = rgb(color);
    return {
        light: hex(mix(c, [255, 255, 255], 0.30)),
        base: hex(c),
        dark: hex(mix(c, [0, 0, 0], 0.34)),
        deep: hex(mix(c, [0, 0, 0], 0.62)),
    };
}

// A stroke of the same color as the fill closes the seams between adjacent faces (anti-aliasing).
const face = (d, col) => `<path d="${d}" fill="${col}" stroke="${col}" stroke-width="0.35" stroke-linejoin="round"/>`;

export const SOLID_SHAPES = {
    cube: t => face('M12 2.4 21.2 7.6 12 12.8 2.8 7.6z', t.light) +
        face('M2.8 7.6 12 12.8V22L2.8 16.8z', t.dark) + face('M21.2 7.6 12 12.8V22l9.2-5.2z', t.base),
    'folder-code': t => face('M3 6.6A1.6 1.6 0 0 1 4.6 5h4.2c.5 0 1 .2 1.3.6l1 1.1c.3.3.7.4 1.1.4h7.2A1.6 1.6 0 0 1 21 8.7v8.7a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.4z', t.dark) +
        `<rect x="3" y="9" width="18" height="10" rx="1.6" fill="${t.base}"/>` +
        `<path d="M10.5 11.8l1 1-2.3 2.1 2.3 2.1-1 1-3.4-3.1zM13.5 11.8l-1 1 2.3 2.1-2.3 2.1 1 1 3.4-3.1z" fill="${t.deep}"/>`,
    board: t => `<rect x="3" y="4" width="5.2" height="16" rx="1.4" fill="${t.dark}"/>` +
        `<rect x="9.4" y="4" width="5.2" height="10.5" rx="1.4" fill="${t.base}"/>` +
        `<rect x="15.8" y="4" width="5.2" height="13" rx="1.4" fill="${t.light}"/>`,
    'folder-solid': t => face('M3 6.6A1.6 1.6 0 0 1 4.6 5h4.2c.5 0 1 .2 1.3.6l1 1.1c.3.3.7.4 1.1.4h7.2A1.6 1.6 0 0 1 21 8.7v8.7a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.4z', t.dark) +
        `<rect x="3" y="9" width="18" height="10" rx="1.6" fill="${t.base}"/>`,
    stack: t => `<rect x="3" y="4" width="18" height="4.4" rx="1.4" fill="${t.light}"/>` +
        `<rect x="3" y="9.8" width="18" height="4.4" rx="1.4" fill="${t.base}"/>` +
        `<rect x="3" y="15.6" width="18" height="4.4" rx="1.4" fill="${t.dark}"/>`,
    grid: t => `<rect x="3" y="3" width="8.4" height="8.4" rx="1.6" fill="${t.light}"/>` +
        `<rect x="12.6" y="3" width="8.4" height="8.4" rx="1.6" fill="${t.base}"/>` +
        `<rect x="3" y="12.6" width="8.4" height="8.4" rx="1.6" fill="${t.base}"/>` +
        `<rect x="12.6" y="12.6" width="8.4" height="8.4" rx="1.6" fill="${t.dark}"/>`,
    star: t => face('M12 2.8 9.3 8.6 3 9.4l4.6 4.4-1.2 6.3L12 17z', t.dark) +
        face('M12 2.8l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17z', t.base),
    flag: t => `<rect x="4.5" y="2.6" width="2.2" height="18.8" rx="1.1" fill="${t.dark}"/>` +
        `<path d="M6 4.2h13.4c.8 0 1.2.9.7 1.5L17.8 9l2.3 3.3c.4.6 0 1.5-.7 1.5H6z" fill="${t.base}"/>`,
};

export function solidSvg(shape, color) {
    const drawing = SOLID_SHAPES[shape];
    return drawing ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${drawing(shades(color))}</svg>\n` : null;
}
