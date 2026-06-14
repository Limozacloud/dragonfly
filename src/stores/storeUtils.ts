export async function optimisticUpdate<S>(params: {
  get: () => S;
  set: (s: Partial<S>) => void;
  keys: (keyof S)[];
  update: () => void;
  db: () => Promise<void>;
  onError: (err: unknown) => void;
}): Promise<void> {
  const rollback = Object.fromEntries(
    params.keys.map((k) => [k, params.get()[k]])
  ) as Partial<S>;

  params.update();

  try {
    await params.db();
  } catch (err) {
    params.set(rollback);
    params.onError(err);
  }
}
