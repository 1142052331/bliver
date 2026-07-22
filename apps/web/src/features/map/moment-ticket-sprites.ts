import {
  footprintMoodTones,
  serializeFootprintMood,
  type FootprintMoodKey,
} from '../../platform/footprint-mood.js';
import type { ExpressionSpecification } from 'maplibre-gl';

export const MOMENT_TICKET_CLUSTER_IMAGE_ID = 'bliver-moment-ticket-cluster';

const MOMENT_TICKET_SPATIAL_IMAGE_ID = 'bliver-moment-ticket-spatial';
const MOMENT_TICKET_MEDIA_IMAGE_ID = 'bliver-moment-ticket-media';
const MOMENT_TICKET_SPATIAL_SELECTED_IMAGE_ID = 'bliver-moment-ticket-spatial-selected';
const MOMENT_TICKET_MEDIA_SELECTED_IMAGE_ID = 'bliver-moment-ticket-media-selected';

export type MapMoodKey = FootprintMoodKey | 'neutral';

type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

export interface MomentTicketSprite {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

const FOREST: Rgba = [23, 59, 49, 255];
const SAGE: Rgba = [169, 201, 191, 255];
const PAPER: Rgba = [252, 253, 250, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const MOOD_KEYS = Object.keys(footprintMoodTones) as FootprintMoodKey[];

export function toMapMoodKey(value?: string | null): MapMoodKey {
  return serializeFootprintMood(value) ?? 'neutral';
}

function createSprite(width: number, height: number): MomentTicketSprite {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function paintPixel(
  sprite: MomentTicketSprite,
  x: number,
  y: number,
  color: Rgba,
): void {
  if (x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return;
  const offset = (Math.floor(y) * sprite.width + Math.floor(x)) * 4;
  sprite.data[offset] = color[0];
  sprite.data[offset + 1] = color[1];
  sprite.data[offset + 2] = color[2];
  sprite.data[offset + 3] = color[3];
}

function paintRect(
  sprite: MomentTicketSprite,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgba,
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      paintPixel(sprite, column, row, color);
    }
  }
}

function paintRoundedRect(
  sprite: MomentTicketSprite,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: Rgba,
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const sampleX = column + 0.5;
      const sampleY = row + 0.5;
      const nearestX = Math.max(x + radius, Math.min(x + width - radius, sampleX));
      const nearestY = Math.max(y + radius, Math.min(y + height - radius, sampleY));
      const distanceX = sampleX - nearestX;
      const distanceY = sampleY - nearestY;
      if (distanceX * distanceX + distanceY * distanceY <= radius * radius) {
        paintPixel(sprite, column, row, color);
      }
    }
  }
}

function paintTip(
  sprite: MomentTicketSprite,
  centerX: number,
  top: number,
  height: number,
  halfWidth: number,
  color: Rgba,
): void {
  for (let row = 0; row < height; row += 1) {
    const remaining = 1 - row / height;
    const width = Math.max(1, Math.ceil(halfWidth * remaining));
    paintRect(sprite, centerX - width, top + row, width * 2, 1, color);
  }
}

function paintCircle(
  sprite: MomentTicketSprite,
  centerX: number,
  centerY: number,
  radius: number,
  color: Rgba,
): void {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const distanceX = x - centerX;
      const distanceY = y - centerY;
      if (distanceX * distanceX + distanceY * distanceY <= radius * radius) {
        paintPixel(sprite, x, y, color);
      }
    }
  }
}

function rgbaFromHex(value: string): Rgba {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
    255,
  ];
}

function paintMoodGlyph(
  sprite: MomentTicketSprite,
  moodKey: FootprintMoodKey,
  accent: Rgba,
  surface: Rgba,
  ink: Rgba,
): void {
  const glyph = footprintMoodTones[moodKey].glyph;
  if (glyph === 'sun') {
    paintCircle(sprite, 28, 26, 6, accent);
    paintCircle(sprite, 28, 26, 2, surface);
    paintRect(sprite, 27, 14, 2, 5, ink);
    paintRect(sprite, 27, 33, 2, 5, ink);
    paintRect(sprite, 16, 25, 5, 2, ink);
    paintRect(sprite, 35, 25, 5, 2, ink);
    return;
  }
  if (glyph === 'waves') {
    paintRoundedRect(sprite, 16, 19, 17, 3, 1, ink);
    paintRoundedRect(sprite, 23, 24, 17, 3, 1, accent);
    paintRoundedRect(sprite, 16, 29, 17, 3, 1, ink);
    return;
  }
  if (glyph === 'heart') {
    paintCircle(sprite, 24, 23, 5, accent);
    paintCircle(sprite, 32, 23, 5, accent);
    paintRect(sprite, 20, 23, 16, 4, accent);
    paintTip(sprite, 28, 27, 10, 8, accent);
    return;
  }
  if (glyph === 'bolt') {
    paintRect(sprite, 27, 15, 7, 8, accent);
    paintRect(sprite, 23, 22, 8, 7, accent);
    paintRect(sprite, 27, 28, 6, 4, accent);
    paintRect(sprite, 27, 31, 3, 6, ink);
    return;
  }
  if (glyph === 'rain') {
    paintCircle(sprite, 23, 22, 5, ink);
    paintCircle(sprite, 29, 20, 7, ink);
    paintCircle(sprite, 35, 23, 5, ink);
    paintRect(sprite, 20, 23, 18, 5, ink);
    paintRect(sprite, 22, 31, 2, 5, accent);
    paintRect(sprite, 28, 30, 2, 6, accent);
    paintRect(sprite, 34, 31, 2, 5, accent);
    return;
  }
  paintCircle(sprite, 28, 25, 10, accent);
  paintCircle(sprite, 33, 21, 9, surface);
}

interface TicketPalette {
  readonly frame: Rgba;
  readonly surface: Rgba;
  readonly ink: Rgba;
  readonly accent: Rgba;
}

function ticketPalette(moodKey: MapMoodKey): TicketPalette {
  if (moodKey === 'neutral') {
    return { frame: FOREST, surface: SAGE, ink: [55, 91, 80, 210], accent: SAGE };
  }
  const tone = footprintMoodTones[moodKey];
  const accent = rgbaFromHex(tone.accent);
  return {
    frame: accent,
    surface: rgbaFromHex(tone.surface),
    ink: rgbaFromHex(tone.ink),
    accent,
  };
}

function createMomentTicketSprite(
  mode: 'spatial' | 'media',
  selected: boolean,
  moodKey: MapMoodKey = 'neutral',
): MomentTicketSprite {
  const sprite = createSprite(56, 72);
  const shadow: Rgba = [10, 28, 23, 45];
  const palette = ticketPalette(moodKey);
  const frame = selected ? FOREST : palette.frame;
  paintRoundedRect(sprite, 6, 5, 46, 59, 8, shadow);
  paintTip(sprite, 30, 62, 9, 9, shadow);
  paintRoundedRect(sprite, 4, 2, 48, 60, 8, frame);
  paintTip(sprite, 28, 60, 11, 10, frame);

  if (!selected) paintRoundedRect(sprite, 7, 5, 42, 54, 5, PAPER);

  const field = mode === 'media'
    ? selected ? WHITE : FOREST
    : moodKey === 'neutral' && selected ? WHITE : palette.surface;
  paintRoundedRect(sprite, 10, 9, 36, 34, 4, field);
  if (mode === 'media') {
    const ridge = selected ? SAGE : ([104, 137, 126, 255] as const);
    const sky = selected ? PAPER : ([195, 218, 210, 255] as const);
    paintRoundedRect(sprite, 13, 12, 30, 13, 2, sky);
    paintRect(sprite, 13, 25, 30, 15, ridge);
    paintRect(sprite, 17, 21, 8, 4, ridge);
    paintRect(sprite, 31, 18, 7, 7, selected ? FOREST : WHITE);
    if (moodKey !== 'neutral') paintRect(sprite, 11, 9, 34, 2, palette.accent);
  } else if (moodKey !== 'neutral') {
    paintMoodGlyph(sprite, moodKey, palette.accent, palette.surface, palette.ink);
  } else {
    const ink: Rgba = selected ? FOREST : ([55, 91, 80, 210] as const);
    paintRect(sprite, 27, 14, 2, 24, ink);
    paintRect(sprite, 16, 25, 24, 2, ink);
    paintRoundedRect(sprite, 24, 22, 8, 8, 4, selected ? SAGE : WHITE);
  }

  const metadataInk: Rgba = selected ? WHITE : FOREST;
  paintRoundedRect(sprite, 11, 48, 22, 3, 1, metadataInk);
  paintRoundedRect(sprite, 11, 54, 13, 2, 1, metadataInk);
  if (selected && moodKey !== 'neutral') {
    paintRoundedRect(sprite, 37, 48, 8, 3, 1, palette.accent);
  }
  return sprite;
}

function paintMiniTicket(
  sprite: MomentTicketSprite,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Rgba,
): void {
  paintRoundedRect(sprite, x, y, width, height - 6, 6, FOREST);
  paintTip(sprite, x + Math.floor(width / 2), y + height - 7, 8, 7, FOREST);
  paintRoundedRect(sprite, x + 3, y + 3, width - 6, height - 13, 3, fill);
}

function createMomentTicketClusterSprite(): MomentTicketSprite {
  const sprite = createSprite(76, 80);
  const shadow: Rgba = [10, 28, 23, 38];
  paintRoundedRect(sprite, 12, 17, 42, 52, 7, shadow);
  paintMiniTicket(sprite, 4, 14, 36, 54, SAGE);
  paintMiniTicket(sprite, 20, 4, 38, 58, PAPER);
  paintMiniTicket(sprite, 31, 15, 40, 60, FOREST);
  paintRoundedRect(sprite, 38, 23, 26, 27, 4, FOREST);
  return sprite;
}

interface MomentTicketSpriteIds {
  readonly spatial: string;
  readonly media: string;
  readonly spatialSelected: string;
  readonly mediaSelected: string;
}

function momentTicketSpriteIds(moodKey: MapMoodKey): MomentTicketSpriteIds {
  if (moodKey === 'neutral') {
    return {
      spatial: MOMENT_TICKET_SPATIAL_IMAGE_ID,
      media: MOMENT_TICKET_MEDIA_IMAGE_ID,
      spatialSelected: MOMENT_TICKET_SPATIAL_SELECTED_IMAGE_ID,
      mediaSelected: MOMENT_TICKET_MEDIA_SELECTED_IMAGE_ID,
    };
  }
  return {
    spatial: `bliver-moment-ticket-spatial-${moodKey}`,
    media: `bliver-moment-ticket-media-${moodKey}`,
    spatialSelected: `bliver-moment-ticket-spatial-${moodKey}-selected`,
    mediaSelected: `bliver-moment-ticket-media-${moodKey}-selected`,
  };
}

function pointSpriteExpression(moodKey: MapMoodKey): ExpressionSpecification {
  const ids = momentTicketSpriteIds(moodKey);
  return [
    'case',
    ['boolean', ['get', 'selected'], false],
    ['case', ['boolean', ['get', 'hasMedia'], false], ids.mediaSelected, ids.spatialSelected],
    ['case', ['boolean', ['get', 'hasMedia'], false], ids.media, ids.spatial],
  ] as ExpressionSpecification;
}

export const POINT_ICON_IMAGE_EXPRESSION: ExpressionSpecification = [
  'match',
  ['get', 'moodKey'],
  ...MOOD_KEYS.flatMap((moodKey) => [moodKey, pointSpriteExpression(moodKey)]),
  pointSpriteExpression('neutral'),
] as unknown as ExpressionSpecification;

export const MOMENT_TICKET_SPRITES: readonly (
  readonly [string, MomentTicketSprite]
)[] = [
  [MOMENT_TICKET_SPATIAL_IMAGE_ID, createMomentTicketSprite('spatial', false)],
  [MOMENT_TICKET_MEDIA_IMAGE_ID, createMomentTicketSprite('media', false)],
  [MOMENT_TICKET_SPATIAL_SELECTED_IMAGE_ID, createMomentTicketSprite('spatial', true)],
  [MOMENT_TICKET_MEDIA_SELECTED_IMAGE_ID, createMomentTicketSprite('media', true)],
  ...MOOD_KEYS.flatMap((moodKey) => {
    const ids = momentTicketSpriteIds(moodKey);
    return [
      [ids.spatial, createMomentTicketSprite('spatial', false, moodKey)] as const,
      [ids.media, createMomentTicketSprite('media', false, moodKey)] as const,
      [ids.spatialSelected, createMomentTicketSprite('spatial', true, moodKey)] as const,
      [ids.mediaSelected, createMomentTicketSprite('media', true, moodKey)] as const,
    ];
  }),
  [MOMENT_TICKET_CLUSTER_IMAGE_ID, createMomentTicketClusterSprite()],
];
