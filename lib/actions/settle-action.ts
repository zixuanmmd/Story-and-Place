export type SettledAction<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export async function settleAction<T>(
  action: () => Promise<T>,
): Promise<SettledAction<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return { ok: false, error };
  }
}
