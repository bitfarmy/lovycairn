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
    shield: t => face('M12 2.6 4 5.6v6c0 4.7 3.3 8.1 8 9.8z', t.dark) + face('M12 2.6l8 3v6c0 4.7-3.3 8.1-8 9.8z', t.base),
    bolt: t => face('M13.6 2.4 5 13.4h5.6l-1.2 8.2 9.6-11.6h-5.8z', t.base) + face('M10.6 13.4 9.4 21.6l4.4-5.3z', t.dark),
    book: t => `<rect x="4.5" y="3" width="15" height="18" rx="1.6" fill="${t.dark}"/>` +
        `<rect x="7" y="3" width="12.5" height="15.5" rx="1.2" fill="${t.base}"/>` +
        `<rect x="7" y="19.2" width="12.5" height="1.8" rx="0.9" fill="${t.light}"/>`,
    cloud: t => `<circle cx="8.2" cy="14" r="4.6" fill="${t.dark}"/><circle cx="14" cy="10.8" r="5.6" fill="${t.light}"/>` +
        `<rect x="3.6" y="13.6" width="16.8" height="6" rx="3" fill="${t.base}"/>`,
    target: t => `<circle cx="12" cy="12" r="9.4" fill="${t.dark}"/><circle cx="12" cy="12" r="6.2" fill="${t.base}"/>` +
        `<circle cx="12" cy="12" r="3" fill="${t.light}"/>`,
    house: t => face('M12 2.8 2.6 11h2.6v9.2h5.4v-6h2.8v6h5.4V11h2.6z', t.base) + face('M12 2.8 2.6 11h18.8z', t.dark),
    terminal: t => face('M2.5 6.4A2.4 2.4 0 0 1 4.9 4h14.2a2.4 2.4 0 0 1 2.4 2.4V8h-19z', t.base) +
        `<path d="M2.5 8h19v9.6a2.4 2.4 0 0 1-2.4 2.4H4.9a2.4 2.4 0 0 1-2.4-2.4z" fill="${t.dark}"/>` +
        `<path d="M6.4 11.4l1.3-1.3 3.5 3.5-3.5 3.5-1.3-1.3 2.2-2.2z" fill="${t.light}"/>` +
        `<rect x="12.4" y="15.4" width="5.4" height="1.9" rx=".5" fill="${t.light}"/>`,
    git: t => `<rect x="6.3" y="5" width="2.4" height="14" rx="1.2" fill="${t.dark}"/>` +
        `<path d="M7.5 16.5c0-3.4 2.1-5.3 5.4-5.6l3.1-.3" fill="none" stroke="${t.dark}" stroke-width="2.4" stroke-linecap="round"/>` +
        `<circle cx="7.5" cy="5.6" r="3" fill="${t.light}"/><circle cx="7.5" cy="18.4" r="3" fill="${t.base}"/>` +
        `<circle cx="16.6" cy="10.4" r="3" fill="${t.base}"/>`,
    penguin: t => `<ellipse cx="8.6" cy="21" rx="3" ry="1.5" fill="${t.base}"/><ellipse cx="15.4" cy="21" rx="3" ry="1.5" fill="${t.base}"/>` +
        `<ellipse cx="4.7" cy="14.2" rx="1.8" ry="4.6" transform="rotate(14 4.7 14.2)" fill="${t.deep}"/>` +
        `<ellipse cx="19.3" cy="14.2" rx="1.8" ry="4.6" transform="rotate(-14 19.3 14.2)" fill="${t.deep}"/>` +
        `<ellipse cx="12" cy="12.6" rx="7.2" ry="9" fill="${t.dark}"/><ellipse cx="12" cy="14.6" rx="4.7" ry="6.5" fill="${t.light}"/>` +
        `<circle cx="9.8" cy="8.4" r="1.4" fill="${t.light}"/><circle cx="14.2" cy="8.4" r="1.4" fill="${t.light}"/>` +
        `<circle cx="9.9" cy="8.5" r=".6" fill="${t.deep}"/><circle cx="14.1" cy="8.5" r=".6" fill="${t.deep}"/>` +
        `<path d="M12 9.8l2.3 1.7c0 1.1-1 1.9-2.3 1.9s-2.3-.8-2.3-1.9z" fill="${t.base}"/>`,
    chip: t => [7.1, 11.1, 15.1].map(v => `<rect x="${v}" y="2.2" width="1.8" height="3.4" rx=".6" fill="${t.dark}"/>` +
        `<rect x="${v}" y="18.4" width="1.8" height="3.4" rx=".6" fill="${t.dark}"/>` +
        `<rect x="2.2" y="${v}" width="3.4" height="1.8" rx=".6" fill="${t.dark}"/>` +
        `<rect x="18.4" y="${v}" width="3.4" height="1.8" rx=".6" fill="${t.dark}"/>`).join('') +
        `<rect x="4.6" y="4.6" width="14.8" height="14.8" rx="2.4" fill="${t.base}"/>` +
        `<rect x="8.4" y="8.4" width="7.2" height="7.2" rx="1.2" fill="${t.light}"/>`,
    bug: t => `<path d="M6.8 12 3.6 10.4M6.6 15H3M7 18l-3 2M17.2 12l3.2-1.6M17.4 15H21M17 18l3 2M10.4 5.4 8.8 2.8M13.6 5.4l1.6-2.6" fill="none" stroke="${t.dark}" stroke-width="1.8" stroke-linecap="round"/>` +
        `<ellipse cx="12" cy="14" rx="5.4" ry="6.8" fill="${t.base}"/><circle cx="12" cy="7.4" r="3.1" fill="${t.light}"/>` +
        `<rect x="11.2" y="9.6" width="1.6" height="11" rx=".8" fill="${t.deep}"/>`,
    database: t => face('M4 15.4v2.8c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-2.8z', t.dark) +
        face('M4 9.8v2.8c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V9.8z', t.base) +
        face('M4 5.8v2.8c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V5.8z', t.dark) +
        `<ellipse cx="12" cy="5.8" rx="8" ry="3.2" fill="${t.light}"/>`,
    code: t => `<rect x="3" y="4.5" width="18" height="15" rx="2.4" fill="${t.base}"/>` +
        face('M3 6.9A2.4 2.4 0 0 1 5.4 4.5h13.2A2.4 2.4 0 0 1 21 6.9V8.4H3z', t.light) +
        `<path d="M10.5 11.8l1 1-2.3 2.1 2.3 2.1-1 1-3.4-3.1zM13.5 11.8l-1 1 2.3 2.1-2.3 2.1 1 1 3.4-3.1z" fill="${t.deep}"/>`,
    container: t => face('M2.4 13.4h19.2c-.4 4.6-4.4 7.4-9.6 7.4S2.8 18 2.4 13.4z', t.dark) +
        `<rect x="9.2" y="3.8" width="5.6" height="4" rx=".8" fill="${t.light}"/>` +
        [3.4, 9.2, 15].map(x => `<rect x="${x}" y="8.6" width="5.6" height="4" rx=".8" fill="${t.base}"/>`).join(''),
    gear: t => [0, 45, 90, 135].map(a => `<rect x="10.4" y="2.4" width="3.2" height="19.2" rx="1" transform="rotate(${a} 12 12)" fill="${t.dark}"/>`).join('') +
        `<circle cx="12" cy="12" r="7.4" fill="${t.base}"/><circle cx="12" cy="12" r="3.2" fill="${t.deep}"/>`,
    rack: t => [[3.6, t.light], [9.6, t.base], [15.6, t.dark]].map(([y, c]) => `<rect x="3" y="${y}" width="18" height="4.8" rx="1.4" fill="${c}"/>` +
        `<circle cx="6.6" cy="${y + 2.4}" r="1" fill="${t.deep}"/><rect x="10.4" y="${y + 1.8}" width="8.2" height="1.2" rx=".6" fill="${t.deep}"/>`).join(''),
    network: t => `<path d="M12 6.8 5.8 17.2h12.4z" fill="none" stroke="${t.dark}" stroke-width="2.2" stroke-linejoin="round"/>` +
        `<circle cx="12" cy="6.4" r="3.6" fill="${t.light}"/><circle cx="5.8" cy="17.2" r="3.6" fill="${t.base}"/><circle cx="18.2" cy="17.2" r="3.6" fill="${t.base}"/>`,
    android: t => `<path d="M8.2 4.6 6.8 2.2M15.8 4.6l1.4-2.4" fill="none" stroke="${t.dark}" stroke-width="1.4" stroke-linecap="round"/>` +
        `<rect x="1.6" y="12.6" width="2.2" height="5.6" rx="1.1" fill="${t.base}"/><rect x="20.2" y="12.6" width="2.2" height="5.6" rx="1.1" fill="${t.base}"/>` +
        `<rect x="8" y="17.6" width="2.4" height="4" rx="1.2" fill="${t.base}"/><rect x="13.6" y="17.6" width="2.4" height="4" rx="1.2" fill="${t.base}"/>` +
        `<path d="M4.6 12.6h14.8V18a2 2 0 0 1-2 2H6.6a2 2 0 0 1-2-2z" fill="${t.dark}"/>` +
        `<path d="M4.6 11.4a7.4 7.4 0 0 1 14.8 0z" fill="${t.light}"/>` +
        `<circle cx="9.2" cy="8.4" r=".9" fill="${t.deep}"/><circle cx="14.8" cy="8.4" r=".9" fill="${t.deep}"/>`,
    phone: t => `<rect x="6.4" y="2.4" width="11.2" height="19.2" rx="2.4" fill="${t.dark}"/>` +
        `<rect x="8" y="5" width="8" height="12.6" rx=".8" fill="${t.light}"/><rect x="10.2" y="19" width="3.6" height="1.1" rx=".55" fill="${t.base}"/>`,
    keyboard: t => `<rect x="2" y="6" width="20" height="12" rx="2.2" fill="${t.dark}"/>` +
        [0, 1, 2, 3].map(i => `<rect x="${4.4 + 4 * i}" y="8" width="3.2" height="2.4" rx=".5" fill="${t.light}"/>` +
            `<rect x="${4.4 + 4 * i}" y="11.2" width="3.2" height="2.4" rx=".5" fill="${t.base}"/>`).join('') +
        `<rect x="7.2" y="14.6" width="9.6" height="2.2" rx=".6" fill="${t.light}"/>`,
    apk: t => `<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3" fill="${t.base}"/>` +
        `<rect x="10.8" y="6.4" width="2.4" height="6.4" rx=".8" fill="${t.deep}"/><path d="M7.4 12h9.2L12 17z" fill="${t.deep}"/>`,
    skull: t => `<rect x="8" y="14.6" width="8" height="6.4" rx="1.8" fill="${t.base}"/><circle cx="12" cy="10.4" r="7.6" fill="${t.light}"/>` +
        `<circle cx="8.8" cy="10.8" r="2.3" fill="${t.deep}"/><circle cx="15.2" cy="10.8" r="2.3" fill="${t.deep}"/>` +
        `<path d="M12 13.2l1.1 2.1h-2.2z" fill="${t.deep}"/>` +
        [10.4, 12, 13.6].map(x => `<rect x="${x - .4}" y="17.8" width=".8" height="3.2" fill="${t.dark}"/>`).join(''),
    padlock: t => `<path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="${t.light}" stroke-width="2.4"/>` +
        `<rect x="4.6" y="10.6" width="14.8" height="10.8" rx="2.2" fill="${t.base}"/>` +
        `<circle cx="12" cy="15" r="1.8" fill="${t.deep}"/><rect x="11.2" y="15.4" width="1.6" height="3.4" fill="${t.deep}"/>`,
    key: t => `<rect x="11.4" y="10.8" width="10.4" height="2.4" rx="1" fill="${t.base}"/><rect x="17.2" y="13" width="2.2" height="3.6" rx=".6" fill="${t.base}"/>` +
        `<rect x="20.2" y="13" width="1.6" height="2.4" rx=".6" fill="${t.base}"/>` +
        `<circle cx="7.8" cy="12" r="5" fill="${t.light}"/><circle cx="7.8" cy="12" r="1.9" fill="${t.deep}"/>`,
    eye: t => `<path d="M1.8 12C4.4 7.2 8 5 12 5s7.6 2.2 10.2 7c-2.6 4.8-6.2 7-10.2 7S4.4 16.8 1.8 12z" fill="${t.dark}"/>` +
        `<circle cx="12" cy="12" r="4.6" fill="${t.light}"/><circle cx="12" cy="12" r="2.2" fill="${t.deep}"/><circle cx="13.2" cy="10.8" r=".9" fill="${t.light}"/>`,
    hacker: t => `<path d="M12 2.6c-4.6 0-7.4 3.4-7.4 8 0 2 .6 3.6 1.4 4.8L4 21.4h16l-2-6c.8-1.2 1.4-2.8 1.4-4.8 0-4.6-2.8-8-7.4-8z" fill="${t.base}"/>` +
        `<ellipse cx="12" cy="11.4" rx="4.6" ry="5" fill="${t.deep}"/>` +
        `<circle cx="10.1" cy="11" r="1" fill="${t.light}"/><circle cx="13.9" cy="11" r="1" fill="${t.light}"/>`,
    download: t => `<path d="M3.6 14.6h2.4V18h12v-3.4h2.4v4.6a1.4 1.4 0 0 1-1.4 1.4H5a1.4 1.4 0 0 1-1.4-1.4z" fill="${t.dark}"/>` +
        `<rect x="10.8" y="3" width="2.4" height="8.6" rx=".6" fill="${t.base}"/><path d="M6.6 10.4h10.8L12 16.4z" fill="${t.light}"/>`,
    music: t => `<rect x="8.6" y="4.6" width="2.2" height="12.2" fill="${t.base}"/><rect x="17" y="3" width="2.2" height="12.2" fill="${t.base}"/>` +
        `<path d="M8.6 4.6 19.2 3v4L8.6 8.6z" fill="${t.light}"/>` +
        `<ellipse cx="7" cy="17.4" rx="3.4" ry="2.7" fill="${t.dark}"/><ellipse cx="15.4" cy="15.8" rx="3.4" ry="2.7" fill="${t.dark}"/>`,
    pictures: t => `<rect x="2.8" y="4.2" width="18.4" height="15.6" rx="2.2" fill="${t.dark}"/><circle cx="8" cy="9.4" r="2" fill="${t.light}"/>` +
        `<path d="M2.8 17.4l5.4-5.2 4 3.8 3-2.6 6 5v1.4a2.2 2.2 0 0 1-2.2 2.2H5a2.2 2.2 0 0 1-2.2-2.2z" fill="${t.base}"/>`,
    video: t => `<rect x="2.8" y="5" width="18.4" height="14" rx="2.6" fill="${t.dark}"/><path d="M10 9v6l5.2-3z" fill="${t.light}"/>`,
    games: t => `<path d="M7 7.4h10c3 0 5 2.6 5.4 6l.6 4c.2 1.6-.8 2.8-2.2 2.8-1 0-1.8-.5-2.4-1.3L16.6 16H7.4l-1.8 2.9c-.6.8-1.4 1.3-2.4 1.3C1.8 20.2.8 19 1 17.4l.6-4C2 10 4 7.4 7 7.4z" fill="${t.base}"/>` +
        `<rect x="5.2" y="10.8" width="4.8" height="1.6" rx=".4" fill="${t.deep}"/><rect x="6.8" y="9.2" width="1.6" height="4.8" rx=".4" fill="${t.deep}"/>` +
        `<circle cx="15.8" cy="10.6" r="1.1" fill="${t.light}"/><circle cx="18.2" cy="12.8" r="1.1" fill="${t.light}"/>`,
    flag: t => `<rect x="4.5" y="2.6" width="2.2" height="18.8" rx="1.1" fill="${t.dark}"/>` +
        `<path d="M6 4.2h13.4c.8 0 1.2.9.7 1.5L17.8 9l2.3 3.3c.4.6 0 1.5-.7 1.5H6z" fill="${t.base}"/>`,
};

export function solidSvg(shape, color) {
    const drawing = SOLID_SHAPES[shape];
    return drawing ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${drawing(shades(color))}</svg>\n` : null;
}
