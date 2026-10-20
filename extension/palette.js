// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

// Colors and font used by every widget LovyCairn draws on the desktop.
// The defaults suit a dark desktop and stay readable on most wallpapers. To restyle LovyCairn, change the
// values here (a console look: set `font` to 'font-family: monospace;').

export const P = {
    font: '',
    ink: '#d9dde3',          // main text
    ink2: '#aeb5bf',         // secondary text
    ink3: '#8a929e',         // hints and captions
    line: '#343942',         // thin borders
    line2: '#4a505b',        // stronger borders
    accent: '#6cc6a1',       // signal color: clean state, selection
    accentTint: 'rgba(108, 198, 161, 0.14)',
    accentTint2: 'rgba(108, 198, 161, 0.24)',
    accentLine: 'rgba(108, 198, 161, 0.55)',
    warn: '#e3ad4b',         // uncommitted changes
    danger: '#e8605b',       // errors
    surface2: '#232830',
    surface3: '#2c323b',
    card: 'rgba(24, 27, 33, 0.97)',
    swatch: {                // colors offered for projects and groups
        green: '#4ac06c', lime: '#a2c841', yellow: '#e4c232', orange: '#f68c26', red: '#f0574e', pink: '#e96ea9',
        violet: '#aa74e2', indigo: '#667ce5', blue: '#3a9bec', cyan: '#3bc4e0', teal: '#22c4b5', gray: '#a0a7a1',
    },
};
