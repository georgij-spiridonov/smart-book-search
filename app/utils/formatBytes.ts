/**
 * Список сокращений для единиц измерения объема данных.
 */
const STORAGE_UNITS = ["Б", "КБ", "МБ", "ГБ", "ТБ", "ПБ", "ЭБ", "ЗБ", "ИБ"] as const;

/**
 * Константа для перевода байтов (1 Кибибайт = 1024 байта).
 */
const BYTES_PER_KIBIBYTE = 1024;

/**
 * Форматирует размер в байтах в человекочитаемую строку.
 * Оптимизировано для высокой скорости выполнения и типизации.
 *
 * @param bytes - Количество байтов для форматирования.
 * @param decimals - Количество знаков после запятой (по умолчанию 2).
 * @returns Отформатированная строка (например, "1.25 МБ").
 */
export function formatBytes(bytes: number, decimals = 2): string {
  // Обработка нулевых или некорректных входных данных
  if (!Number.isFinite(bytes) || bytes === 0) {
    return `0 ${STORAGE_UNITS[0]}`;
  }

  const isNegative = bytes < 0;
  const absoluteBytes = Math.abs(bytes);
  const safeDecimals = Math.max(0, decimals);

  // Вычисляем индекс подходящей единицы измерения. 
  // Логарифмический подход быстрее, чем цикл для больших диапазонов.
  const unitIndex = Math.floor(Math.log(absoluteBytes) / Math.log(BYTES_PER_KIBIBYTE));
  
  // Убеждаемся, что индекс не выходит за пределы массива STORAGE_UNITS
  const clampedUnitIndex = Math.min(unitIndex, STORAGE_UNITS.length - 1);

  // Вычисляем значение в соответствующей единице измерения
  const convertedValue = absoluteBytes / (BYTES_PER_KIBIBYTE ** clampedUnitIndex);

  // Форматируем число: 
  // 1. toFixed(safeDecimals) - округляет до нужного количества знаков
  // 2. Number() - убирает лишние нули в конце (например, 1.20 -> 1.2)
  const formattedValue = Number(convertedValue.toFixed(safeDecimals));

  return `${isNegative ? "-" : ""}${formattedValue} ${STORAGE_UNITS[clampedUnitIndex]}`;
}
