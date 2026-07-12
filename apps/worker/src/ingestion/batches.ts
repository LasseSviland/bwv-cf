export async function processInBatches<T>(
  items: readonly T[],
  batchSize: number,
  operation: (item: T) => Promise<void>,
): Promise<void> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError("batchSize must be a positive safe integer");
  }
  for (let offset = 0; offset < items.length; offset += batchSize) {
    await Promise.all(items.slice(offset, offset + batchSize).map(operation));
  }
}
