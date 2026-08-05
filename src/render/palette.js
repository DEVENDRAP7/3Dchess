/** Colour identity for the two armies and the board they fight on. */

export const PALETTE = {
  w: {
    plate: 0xf2e8d2,
    plateDark: 0xd6c9ac,
    trim: 0xe9b949,
    trimDeep: 0xb8862a,
    cloth: 0x2f6fd0,
    clothDeep: 0x1d4a92,
    leather: 0x9a7248,
    stone: 0xe3d8bd,
    stoneDark: 0xbfb195,
    skin: 0xe6c2a1,
    hair: 0xe4dcc7,
    beast: 0xf0e7d5,
    beastDark: 0xcfc3aa,
    gem: 0xffd76a,
    glow: 0xffe9b0,
    eye: 0x9fd8ff,
  },
  b: {
    plate: 0x3c3e4b,
    plateDark: 0x24252e,
    trim: 0xa87ce8,
    trimDeep: 0x6a45a8,
    cloth: 0x6d1a33,
    clothDeep: 0x430f1f,
    leather: 0x4a3b33,
    stone: 0x383a46,
    stoneDark: 0x222430,
    skin: 0xbda690,
    hair: 0x2a2b33,
    beast: 0x3e404c,
    beastDark: 0x26272f,
    gem: 0xb47cff,
    glow: 0xc79bff,
    eye: 0xd9a6ff,
  },
};

/**
 * Board and environment themes.
 *
 * `bright` themes light the scene like a daylit room rather than a hall at
 * night: the renderer raises ambient light, the particle system switches from
 * additive to normal blending so effects stay visible against pale colours,
 * and the interface swaps to a light palette.
 */
export const BOARD_THEMES = {
  classic: {
    label: 'Classic',
    bright: true,
    light: 0xf4f2ec,      // white squares
    dark: 0x33353a,       // black squares
    frame: 0xa9835a,      // warm wood surround
    frameTrim: 0x6d4f30,
    ground: 0xd5d9e2,
    fog: 0xe8ecf4,
    sky: 0xeef2f9,
    keyLight: 0xfff8ec,
    fillLight: 0xc8d8ff,
  },
  marble: {
    label: 'Marble',
    bright: true,
    light: 0xf6f4ef,
    dark: 0x59606e,
    frame: 0xdad5c9,
    frameTrim: 0x9c8b6d,
    ground: 0xe3e6ec,
    fog: 0xeef1f6,
    sky: 0xf3f6fb,
    keyLight: 0xffffff,
    fillLight: 0xd2e0ff,
  },
  solstice: {
    label: 'Solstice',
    light: 0xe8dcc0,
    dark: 0x6d4b34,
    frame: 0x3f2a1d,
    frameTrim: 0xc79a4e,
    ground: 0x14161f,
    fog: 0x0a0b12,
    sky: 0x121628,
    keyLight: 0xfff0d0,
    fillLight: 0x4d6cff,
  },
  obsidian: {
    label: 'Obsidian',
    light: 0xb9c2d4,
    dark: 0x2c3140,
    frame: 0x1a1d26,
    frameTrim: 0x8f7bd6,
    ground: 0x090a10,
    fog: 0x06070c,
    sky: 0x0d1020,
    keyLight: 0xdfe6ff,
    fillLight: 0x9a5cff,
  },
  verdant: {
    label: 'Verdant',
    light: 0xe6e2cf,
    dark: 0x3f6b4a,
    frame: 0x27402d,
    frameTrim: 0xd0b569,
    ground: 0x101a14,
    fog: 0x08110c,
    sky: 0x11251a,
    keyLight: 0xfff4d8,
    fillLight: 0x49c07a,
  },
};

export const HIGHLIGHT = {
  select: 0x6ee7ff,
  move: 0x7dfab0,
  capture: 0xff6b6b,
  lastMove: 0xffd76a,
  check: 0xff3b47,
  castle: 0xb98bff,
};
