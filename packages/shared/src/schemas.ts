import { z } from 'zod';
import { MAP_STYLES, MAX_MAP_SIZE, MIN_MAP_SIZE, type GameAction } from './game';

export const tokenSchema = z.string().uuid();
export const playerNameSchema = z.string().trim().min(2).max(24);
export const roomIdSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{5}$/);
export const chatTextSchema = z.string().trim().min(1).max(500);

const coordSchema = z.object({ q: z.number().int(), r: z.number().int() });

export const gameActionSchema: z.ZodType<GameAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), unitId: z.string().max(64), to: coordSchema }),
  z.object({ type: z.literal('harvest'), colonyId: z.string().max(64) }),
  z.object({ type: z.literal('drop_unsupplied'), unitIds: z.array(z.string().max(64)).max(200) }),
  z.object({ type: z.literal('end_phase') }),
]);

export const mapSizeSchema = z.number().int().min(MIN_MAP_SIZE).max(MAX_MAP_SIZE);

export const mapStyleSchema = z.enum(MAP_STYLES);

export const createSessionSchema = z.object({ name: playerNameSchema });
export const roomRefSchema = z.object({ roomId: roomIdSchema });
export const configureRoomSchema = roomRefSchema.extend({ mapSize: mapSizeSchema, mapStyle: mapStyleSchema });
export const gameActionPayloadSchema = roomRefSchema.extend({ action: gameActionSchema });
export const chatSendSchema = roomRefSchema.extend({ text: chatTextSchema });
