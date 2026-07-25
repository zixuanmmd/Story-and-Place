export type TimestampCursor = {
  timestamp: string;
  id: string;
};

export function descendingTimestampFilter(
  timestampColumn: string,
  idColumn: string,
  cursor: TimestampCursor,
) {
  return `${timestampColumn}.lt.${cursor.timestamp},and(${timestampColumn}.eq.${cursor.timestamp},${idColumn}.lt.${cursor.id})`;
}

export function ascendingTimestampFilter(
  timestampColumn: string,
  idColumn: string,
  cursor: TimestampCursor,
) {
  return `${timestampColumn}.gt.${cursor.timestamp},and(${timestampColumn}.eq.${cursor.timestamp},${idColumn}.gt.${cursor.id})`;
}

export function mergeUniqueById<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
) {
  const seen = new Set(current.map((item) => item.id));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  ];
}
