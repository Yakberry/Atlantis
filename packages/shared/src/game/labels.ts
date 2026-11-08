import type { Resource, UnitKind } from './model';

export const RESOURCE_LABELS: Record<Resource, string> = {
  food: 'Пища',
  wood: 'Лес',
  marble: 'Мрамор',
  copper: 'Медь',
};

/** Названия видов для интерфейса и чата. */
export const UNIT_LABELS: Record<UnitKind, string> = {
  unit: 'Фаланга',
  rider: 'Кавалерия',
  archer: 'Стрелки',
  scout: 'Разведчики',
  catapult: 'Катапульта',
  colony: 'Колония',
  fortified_colony: 'Укреплённая колония',
};
