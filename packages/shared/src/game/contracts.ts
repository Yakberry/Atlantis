import {
  emptyStock,
  RESOURCES,
  MAX_CONTRACT_TURNS,
  type Applied,
  type Contract,
  type Report,
  type ReportData,
  type ContractTerms,
  type ContractView,
  type GameAction,
  type GameState,
  type Result,
  type Stock,
} from './model';
import { fail, ok } from './result';

const sum = (stock: Stock) => RESOURCES.reduce((total, resource) => total + stock[resource], 0);
const mix = (a: Stock, b: Stock, sign: 1 | -1): Stock => {
  const out = emptyStock();
  for (const resource of RESOURCES) out[resource] = a[resource] + sign * b[resource];
  return out;
};
const fits = (stock: Stock, cost: Stock) => RESOURCES.every((resource) => cost[resource] <= stock[resource]);
const sound = (stock: Stock) => RESOURCES.every((resource) => Number.isInteger(stock[resource]) && stock[resource] >= 0);
const stockOf = (state: GameState, id: string) => state.stock[id] ?? emptyStock();
const replace = (contracts: Contract[], item: Contract) => contracts.map((c) => (c.id === item.id ? item : c));
const side = (c: Contract, playerId: string): 'from' | 'to' => (playerId === c.fromId ? 'from' : 'to');
const other = (c: Contract, playerId: string) => (playerId === c.fromId ? c.toId : c.fromId);
const span = (c: Contract) => Math.max(c.terms.perTurn?.turns ?? 0, c.terms.debt?.turns ?? 0);
const turnOf = (state: GameState, c: Contract) => (c.startTurn === null ? 0 : state.turn - c.startTurn);
const involves = (c: Contract, playerId: string) => c.fromId === playerId || c.toId === playerId;

/**
 * Что игрок должен заплатить по действующему договору в этом ходу. Платежи идут со следующего хода после принятия (k ≥ 1):
 * «каждый ход» — каждая сторона платит свою часть; «долг» возвращает заёмщик (можно раньше срока, на последнем ходу обязательно).
 */
export function owed(state: GameState, c: Contract, playerId: string) {
  const k = turnOf(state, c);
  const mine = side(c, playerId);
  let cost = emptyStock();
  let perTurn = false;
  let debt = false;
  if (c.status === 'active' && k >= 1) {
    const { perTurn: pt, debt: d } = c.terms;
    if (pt && k <= pt.turns && !c.paid[mine]) {
      const amount = mine === 'from' ? pt.give : pt.get;
      if (sum(amount) > 0) {
        cost = mix(cost, amount, 1);
        perTurn = true;
      }
    }
    if (d && mine === (d.lend ? 'to' : 'from') && k <= d.turns && !c.debtRepaid && sum(d.amount) > 0) {
      cost = mix(cost, d.amount, 1); // возвращается та же сумма
      debt = true;
    }
  }
  return { cost, perTurn, debt, mandatory: perTurn || (debt && k === c.terms.debt?.turns) };
}

/** Есть платёж, без которого нельзя закончить ход. */
export const hasDue = (state: GameState, playerId: string) =>
  state.contracts.some((c) => involves(c, playerId) && owed(state, c, playerId).mandatory);

/** Есть непрочитанное предложение договора. */
export const hasIncoming = (state: GameState, playerId: string) =>
  state.contracts.some((c) => c.status === 'offered' && c.toId === playerId);

/** Сколько дел по договорам ждёт игрока: входящие предложения и обязательные платежи. */
export const contractAlerts = (state: GameState, playerId: string) =>
  state.contracts.filter(
    (c) => (c.status === 'offered' && c.toId === playerId) || (involves(c, playerId) && owed(state, c, playerId).mandatory),
  ).length;

/** Договоры игрока для снимка: чужие не видны. */
export function contractViews(state: GameState, viewerId: string): ContractView[] {
  const mine = stockOf(state, viewerId);
  return state.contracts
    .filter((c) => involves(c, viewerId))
    .map((c) => {
      const due = owed(state, c, viewerId);
      return { ...c, k: turnOf(state, c), owe: due.cost, payable: sum(due.cost) > 0, canPay: fits(mine, due.cost), mandatory: due.mandatory };
    });
}

function offerContract(state: GameState, playerId: string, to: string, terms: ContractTerms): Result<Applied> {
  if (to === playerId || !state.playerOrder.includes(to)) return fail('Выберите другого игрока');
  if (!terms.instant && !terms.perTurn && !terms.debt) return fail('Раскройте и заполните хотя бы одно условие договора');
  for (const part of [terms.instant, terms.perTurn]) {
    if (part && (!sound(part.give) || !sound(part.get) || sum(part.give) + sum(part.get) === 0)) {
      return fail('В каждом условии должны быть ресурсы');
    }
  }
  if (terms.debt && (!sound(terms.debt.amount) || sum(terms.debt.amount) === 0)) return fail('В долге должны быть ресурсы');
  for (const part of [terms.perTurn, terms.debt]) {
    if (part && !(Number.isInteger(part.turns) && part.turns >= 1 && part.turns <= MAX_CONTRACT_TURNS)) {
      return fail(`Срок договора — от 1 до ${MAX_CONTRACT_TURNS} ходов`);
    }
  }
  if (!Number.isInteger(terms.penalty) || terms.penalty < 0) return fail('Штраф — целое число не меньше нуля');

  const reserved = terms.instant?.give ?? emptyStock();
  const mine = stockOf(state, playerId);
  if (!fits(mine, reserved)) return fail('Не хватает ресурсов для мгновенного обмена');

  const contract: Contract = {
    id: `contract-${state.nextId}`,
    fromId: playerId,
    toId: to,
    terms,
    status: 'offered',
    offeredTurn: state.turn,
    startTurn: null,
    endedTurn: null,
    reserved,
    paid: { from: false, to: false },
    debtRepaid: false,
    terminatedBy: null,
  };
  return ok({
    ...state,
    nextId: state.nextId + 1,
    stock: { ...state.stock, [playerId]: mix(mine, reserved, -1) }, // предлагаемое при мгновенном обмене резервируется
    contracts: [...state.contracts, contract],
    ready: state.ready.filter((id) => id !== to), // получатель снова может действовать
  });
}

function acceptContract(state: GameState, playerId: string, id: string): Result<Applied> {
  const c = state.contracts.find((x) => x.id === id && x.toId === playerId && x.status === 'offered');
  if (!c) return fail('Предложение не найдено');
  let from = stockOf(state, c.fromId);
  let to = stockOf(state, playerId);
  const { instant, debt } = c.terms;
  if (instant) {
    if (!fits(to, instant.get)) return fail('Вам не хватает ресурсов для мгновенного обмена');
    to = mix(mix(to, instant.get, -1), c.reserved, 1);
    from = mix(from, instant.get, 1);
  }
  if (debt) {
    // Кредитор отдаёт сумму заёмщику сразу; возвращается та же сумма.
    if (debt.lend) {
      if (!fits(from, debt.amount)) return fail('У предложившего не хватает ресурсов для займа');
      from = mix(from, debt.amount, -1);
      to = mix(to, debt.amount, 1);
    } else {
      if (!fits(to, debt.amount)) return fail('Вам не хватает ресурсов, чтобы дать в долг');
      to = mix(to, debt.amount, -1);
      from = mix(from, debt.amount, 1);
    }
  }
  const lasting = c.terms.perTurn !== undefined || debt !== undefined;
  const accepted: Contract = {
    ...c,
    reserved: emptyStock(),
    status: lasting ? 'active' : 'completed',
    startTurn: state.turn,
    endedTurn: lasting ? null : state.turn,
  };
  return ok({ ...state, stock: { ...state.stock, [c.fromId]: from, [playerId]: to }, contracts: replace(state.contracts, accepted) });
}

function declineContract(state: GameState, playerId: string, id: string): Result<Applied> {
  const c = state.contracts.find((x) => x.id === id && x.toId === playerId && x.status === 'offered');
  if (!c) return fail('Предложение не найдено');
  const declined: Contract = { ...c, status: 'declined', endedTurn: state.turn, reserved: emptyStock() };
  return ok({
    ...state,
    stock: { ...state.stock, [c.fromId]: mix(stockOf(state, c.fromId), c.reserved, 1) }, // резерв возвращается
    contracts: replace(state.contracts, declined),
  });
}

function payContract(state: GameState, playerId: string, id: string): Result<Applied> {
  const c = state.contracts.find((x) => x.id === id && involves(x, playerId) && x.status === 'active');
  if (!c) return fail('Договор не найден');
  const due = owed(state, c, playerId);
  if (sum(due.cost) === 0) return fail('Платить по этому договору сейчас нечего');
  const mine = stockOf(state, playerId);
  if (!fits(mine, due.cost)) return fail('Не хватает ресурсов: остаётся только расторгнуть договор');
  const to = other(c, playerId);
  const updated: Contract = {
    ...c,
    paid: due.perTurn ? { ...c.paid, [side(c, playerId)]: true } : c.paid,
    debtRepaid: c.debtRepaid || due.debt,
  };
  return ok({
    ...state,
    stock: { ...state.stock, [playerId]: mix(mine, due.cost, -1), [to]: mix(stockOf(state, to), due.cost, 1) },
    contracts: replace(state.contracts, updated),
  });
}

/** Расторжение: расторгающий отдаёт другой стороне штраф — ровно `penalty` ресурсов или все свои, если их меньше. */
function terminateContract(state: GameState, playerId: string, id: string, give: Stock): Result<Applied> {
  const c = state.contracts.find((x) => x.id === id && involves(x, playerId) && x.status === 'active');
  if (!c) return fail('Договор не найден');
  const mine = stockOf(state, playerId);
  const required = Math.min(c.terms.penalty, sum(mine));
  if (!sound(give) || sum(give) !== required) return fail(`Для расторжения нужно отдать ${required} ресурсов`);
  if (!fits(mine, give)) return fail('Не хватает ресурсов');
  const to = other(c, playerId);
  const ended: Contract = { ...c, status: 'terminated', terminatedBy: playerId, endedTurn: state.turn };
  return ok({
    ...state,
    stock: { ...state.stock, [playerId]: mix(mine, give, -1), [to]: mix(stockOf(state, to), give, 1) },
    contracts: replace(state.contracts, ended),
  });
}

type ContractAction = Extract<
  GameAction,
  { type: 'contract_offer' | 'contract_accept' | 'contract_decline' | 'contract_pay' | 'contract_terminate' }
>;

function dispatch(state: GameState, playerId: string, action: ContractAction): Result<Applied> {
  switch (action.type) {
    case 'contract_offer':
      return offerContract(state, playerId, action.to, action.terms);
    case 'contract_accept':
      return acceptContract(state, playerId, action.contractId);
    case 'contract_decline':
      return declineContract(state, playerId, action.contractId);
    case 'contract_pay':
      return payContract(state, playerId, action.contractId);
    case 'contract_terminate':
      return terminateContract(state, playerId, action.contractId, action.give);
  }
}

/** Начало фазы торговли: платежи нового хода ещё не внесены. */
export const resetPayments = (contracts: Contract[]): Contract[] =>
  contracts.map((c) => (c.status === 'active' ? { ...c, paid: { from: false, to: false } } : c));

/** Конец фазы торговли: неотвеченные предложения сгорают (резерв возвращается), отработавшие договоры завершаются. */
export function closeTradePhase(state: GameState): GameState {
  const stock = { ...state.stock };
  const contracts = state.contracts.map((c): Contract => {
    if (c.status === 'offered') {
      stock[c.fromId] = mix(stock[c.fromId] ?? emptyStock(), c.reserved, 1);
      return { ...c, status: 'expired', endedTurn: state.turn, reserved: emptyStock() };
    }
    if (c.status === 'active' && turnOf(state, c) >= span(c)) return { ...c, status: 'completed', endedTurn: state.turn };
    return c;
  });
  return { ...state, stock, contracts };
}

/** Игрок вышел из партии: его договоры расторгаются без штрафа, резервы оставшихся игроков возвращаются. */
export function leaveContracts(state: GameState, playerId: string): { stock: Record<string, Stock>; contracts: Contract[] } {
  const stock = Object.fromEntries(Object.entries(state.stock).filter(([id]) => id !== playerId));
  const contracts = state.contracts.map((c): Contract => {
    if (!involves(c, playerId) || (c.status !== 'offered' && c.status !== 'active')) return c;
    if (c.status === 'offered' && c.fromId !== playerId) stock[c.fromId] = mix(stock[c.fromId] ?? emptyStock(), c.reserved, 1);
    return { ...c, status: 'terminated', terminatedBy: playerId, endedTurn: state.turn, reserved: emptyStock() };
  });
  return { stock, contracts };
}

const EVENTS: Record<ContractAction['type'], Extract<ReportData, { type: 'contract' }>['event']> = {
  contract_offer: 'offered',
  contract_accept: 'accepted',
  contract_decline: 'declined',
  contract_pay: 'paid',
  contract_terminate: 'terminated',
};

/** Событие договора для уведомлений: кому о нём знать и сколько отдал действовавший игрок. */
function reportFor(before: GameState, after: GameState, actorId: string, action: ContractAction): Report | null {
  const id = action.type === 'contract_offer' ? `contract-${before.nextId}` : action.contractId;
  const c = after.contracts.find((x) => x.id === id);
  if (!c) return null;
  const event = EVENTS[action.type];
  const audience =
    event === 'offered' ? [c.toId] : event === 'accepted' ? [c.fromId, c.toId] : event === 'declined' ? [c.fromId] : [other(c, actorId)];
  const paid = mix(stockOf(before, actorId), stockOf(after, actorId), -1);
  return { audience, data: { type: 'contract', event, contractId: c.id, fromId: c.fromId, toId: c.toId, actorId, terms: c.terms, paid } };
}

export function contractAction(state: GameState, playerId: string, action: ContractAction): Result<Applied> {
  const result = dispatch(state, playerId, action);
  if (!result.ok) return result;
  const report = reportFor(state, result.value.state, playerId, action);
  return report ? ok(result.value.state, result.value.events, [...result.value.reports, report]) : result;
}
