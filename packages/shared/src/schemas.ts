import { z } from 'zod';
import { BUILDING_TYPES, MAP_STYLES, MAX_CONTRACT_TURNS, RESOURCES, MAX_MAP_SIZE, MIN_MAP_SIZE, type GameAction } from './game';

export const tokenSchema = z.string().uuid();
export const playerNameSchema = z.string().trim().min(2).max(24);
export const roomIdSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{5}$/);
export const chatTextSchema = z.string().trim().min(1).max(500);

const coordSchema = z.object({ q: z.number().int(), r: z.number().int() });
const count = z.number().int().min(0).max(99);
const stockSchema = z.object({ food: count, wood: count, marble: count, copper: count });
const partSchema = z.object({ give: stockSchema, get: stockSchema });
const lastingSchema = partSchema.extend({ turns: z.number().int().min(1).max(MAX_CONTRACT_TURNS) });
const termsSchema = z.object({
  instant: partSchema.optional(),
  perTurn: lastingSchema.optional(),
  debt: lastingSchema.optional(),
  penalty: z.number().int().min(0).max(99),
});

export const gameActionSchema: z.ZodType<GameAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), unitId: z.string().max(64), to: coordSchema }),
  z.object({ type: z.literal('harvest'), colonyId: z.string().max(64) }),
  z.object({ type: z.literal('drop_unsupplied'), unitIds: z.array(z.string().max(64)).max(200) }),
  z.object({ type: z.literal('build'), building: z.enum(BUILDING_TYPES), at: coordSchema, to: coordSchema.optional() }),
  z.object({ type: z.literal('trade'), give: stockSchema, get: z.enum(RESOURCES) }),
  z.object({ type: z.literal('contract_offer'), to: z.string().min(1), terms: termsSchema }),
  z.object({ type: z.literal('contract_accept'), contractId: z.string().min(1) }),
  z.object({ type: z.literal('contract_decline'), contractId: z.string().min(1) }),
  z.object({ type: z.literal('contract_pay'), contractId: z.string().min(1) }),
  z.object({ type: z.literal('contract_terminate'), contractId: z.string().min(1), give: stockSchema }),
  z.object({ type: z.literal('end_phase') }),
]);

export const mapSizeSchema = z.number().int().min(MIN_MAP_SIZE).max(MAX_MAP_SIZE);

export const mapStyleSchema = z.enum(MAP_STYLES);

export const createSessionSchema = z.object({ name: playerNameSchema });
export const roomRefSchema = z.object({ roomId: roomIdSchema });
export const configureRoomSchema = roomRefSchema.extend({ mapSize: mapSizeSchema, mapStyle: mapStyleSchema });
export const gameActionPayloadSchema = roomRefSchema.extend({ action: gameActionSchema });
export const chatSendSchema = roomRefSchema.extend({ text: chatTextSchema });
