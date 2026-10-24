import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { Bounds } from '../board/layout';

type Point = { x: number; y: number };

const WHEEL_SPEED = 0.0015;
const DRAG_THRESHOLD = 5; // пикселей: меньшее смещение считаем кликом, а не перетаскиванием
const MIN_FIT_RATIO = 0.5; // можно отдалить до половины масштаба «вся карта целиком»
const MAX_SCALE = 3; // пикселей на единицу SVG

/**
 * Перетаскивание и масштабирование SVG-карты: колесо мыши, два пальца, кнопки.
 * Состояние — центр вида и масштаб; `viewBox` всегда совпадает пропорциями с контейнером,
 * поэтому пересчёт «экран → карта» не зависит от DOM и работает и посреди жеста.
 */
export function usePanZoom(viewport: Ref<HTMLElement | null>, bounds: Ref<Bounds>) {
  const size = ref({ width: 1, height: 1 });
  const center = ref<Point>({ x: 0, y: 0 });
  const scale = ref(1);

  const pointers = new Map<number, Point>();
  let start: Point = { x: 0, y: 0 };
  let fitted = true; // пока пользователь не двигал карту, подгоняем её под размер контейнера
  let dragged = false;

  const fitScale = computed(() =>
    Math.min(size.value.width / bounds.value.width, size.value.height / bounds.value.height),
  );
  const clampScale = (value: number) =>
    Math.min(Math.max(MAX_SCALE, fitScale.value * 2), Math.max(fitScale.value * MIN_FIT_RATIO, value));

  const viewBox = computed(() => {
    const width = size.value.width / scale.value;
    const height = size.value.height / scale.value;
    return `${center.value.x - width / 2} ${center.value.y - height / 2} ${width} ${height}`;
  });

  const box = () => viewport.value!.getBoundingClientRect(); // вызывается только после монтирования

  function fit(): void {
    const { x, y, width, height } = bounds.value;
    center.value = { x: x + width / 2, y: y + height / 2 };
    scale.value = fitScale.value;
    fitted = true;
  }

  const toMap = (point: Point): Point => {
    const rect = box();
    return {
      x: center.value.x + (point.x - rect.left - rect.width / 2) / scale.value,
      y: center.value.y + (point.y - rect.top - rect.height / 2) / scale.value,
    };
  };

  /** Масштабирует так, чтобы точка под курсором осталась на месте. */
  function zoomAt(point: Point, factor: number): void {
    const anchor = toMap(point);
    scale.value = clampScale(scale.value * factor);
    const rect = box();
    center.value = {
      x: anchor.x - (point.x - rect.left - rect.width / 2) / scale.value,
      y: anchor.y - (point.y - rect.top - rect.height / 2) / scale.value,
    };
    fitted = false;
  }

  function zoomBy(factor: number): void {
    const rect = box();
    zoomAt({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, factor);
  }

  function panBy(dx: number, dy: number): void {
    center.value = { x: center.value.x - dx / scale.value, y: center.value.y - dy / scale.value };
    fitted = false;
  }

  /** Центр и разброс всех касаний: один палец двигает карту, два — ещё и масштабируют. */
  function gesture(): (Point & { spread: number }) | null {
    const points = [...pointers.values()];
    const [a, b] = points;
    if (!a) return null;
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
      spread: b && points.length === 2 ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
    };
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      if (event.button !== 0) return;
      pointers.clear(); // мышь одна; убираем «залипшее» нажатие, отпущенное вне карты
    }
    const point = { x: event.clientX, y: event.clientY };
    if (pointers.size === 0) {
      start = point;
      dragged = false;
    } else {
      dragged = true; // второй палец — это жест, а не касание
    }
    pointers.set(event.pointerId, point);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) return;
    const before = gesture();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = gesture();
    if (!before || !after) return;

    if (!dragged) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD) return;
      dragged = true;
    }
    // Захват указателя только после начала перетаскивания: иначе он «съел» бы обычные клики по гексам.
    const target = event.currentTarget as Element;
    if (!target.hasPointerCapture(event.pointerId)) target.setPointerCapture(event.pointerId);

    panBy(after.x - before.x, after.y - before.y);
    if (before.spread > 0 && after.spread > 0) zoomAt(after, after.spread / before.spread);
  }

  function onPointerEnd(event: PointerEvent): void {
    pointers.delete(event.pointerId);
  }

  function onWheel(event: WheelEvent): void {
    zoomAt({ x: event.clientX, y: event.clientY }, Math.exp(-event.deltaY * WHEEL_SPEED));
  }

  let observer: ResizeObserver | undefined;
  function measure(): void {
    const rect = box();
    size.value = { width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) };
    if (fitted) fit();
    else scale.value = clampScale(scale.value);
  }

  onMounted(() => {
    observer = new ResizeObserver(measure);
    observer.observe(viewport.value!);
    measure();
  });
  onBeforeUnmount(() => observer?.disconnect());

  // Новая карта (другая форма) — показываем целиком; обновления того же поля вид не сбрасывают.
  watch(
    () => {
      const { x, y, width, height } = bounds.value;
      return [x, y, width, height].join();
    },
    fit,
  );

  return {
    viewBox,
    fit,
    zoomBy,
    /** Был ли жест перетаскиванием: тогда последующий клик не должен выбирать юнитов. */
    wasDragged: () => dragged,
    handlers: { onPointerDown, onPointerMove, onPointerEnd, onWheel },
  };
}
