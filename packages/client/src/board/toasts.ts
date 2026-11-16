import { RESOURCES, UNIT_LABELS, type Coord, type ReportData, type Resource, type Stock } from '@atlantis/shared';
import type { ToastInput } from '../stores/toasts';

type Context = { me: string; names: Record<string, string>; hexName: (hex: Coord) => string | null | undefined };

const signed = (stock: Stock, sign: 1 | -1) => {
  const out: Partial<Record<Resource, number>> = {};
  for (const resource of RESOURCES) if (stock[resource] > 0) out[resource] = sign * stock[resource];
  return out;
};

/** Уведомление для игрока по событию игры (или `null`, если ему оно ни к чему). */
export function toastFromReport(data: ReportData, { me, names, hexName }: Context): ToastInput | null {
  const who = (id: string) => names[id] ?? 'игрок';
  const place = (hex: Coord) => {
    const name = hexName(hex);
    return name ? `локации «${name}»` : 'локации';
  };

  switch (data.type) {
    case 'supply':
      return data.playerId === me && RESOURCES.some((r) => data.spent[r] > 0)
        ? { key: 'supply', title: 'Снабжение', amounts: signed(data.spent, -1) }
        : null;

    case 'battle': {
      const mine = data.losses[me];
      if (!mine) return null;
      const theirs = Object.entries(data.losses).reduce((sum, [id, lost]) => sum + (id === me ? 0 : lost.length), 0);
      const outcome = theirs > mine.length ? 'Одержана победа' : theirs < mine.length ? 'Потерпено поражение' : 'Бой без победителя';
      return {
        key: `battle:${data.hex.q},${data.hex.r}`,
        title: `${outcome} в ${place(data.hex)}`,
        amounts: {},
        action: { type: 'hex', hex: data.hex },
      };
    }

    case 'burn': {
      if (!data.burned) return null;
      const what = UNIT_LABELS[data.kind].toLowerCase();
      const key = `burn:${data.hex.q},${data.hex.r}`;
      if (data.ownerId === me) return { key, title: `Потерпено поражение в ${place(data.hex)}`, note: `Сожжено: ${what}`, amounts: {}, action: { type: 'hex', hex: data.hex } };
      if (data.attackerIds.includes(me)) return { key, title: `Одержана победа в ${place(data.hex)}`, note: `Уничтожено: ${what}`, amounts: {}, action: { type: 'hex', hex: data.hex } };
      return null;
    }

    case 'contract': {
      const actor = who(data.actorId);
      const open = (tab: 'offers' | 'active' | 'history') => ({ type: 'contract' as const, contractId: data.contractId, tab });
      const base = `contract:${data.contractId}:${data.event}`;
      switch (data.event) {
        case 'offered':
          return { key: base, title: `Новое предложение от ${actor}`, amounts: {}, action: open('offers') };
        case 'accepted':
          return data.actorId === me
            ? null
            : { key: base, title: `${actor} принял договор`, amounts: {}, action: open(data.terms.perTurn || data.terms.debt ? 'active' : 'history') };
        case 'declined':
          return { key: base, title: `${actor} отказался от договора`, amounts: {}, action: open('history') };
        case 'terminated':
          return { key: base, title: `${actor} расторг договор`, note: 'Штраф получен', amounts: signed(data.paid, 1), action: open('history') };
        case 'paid':
          return { key: `paid:${data.actorId}`, title: `Выплата от ${actor}`, amounts: signed(data.paid, 1), action: open('active') };
      }
      return null;
    }

    default:
      return null;
  }
}
