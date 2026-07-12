const DATASET_ROOT = "datasets/v1";
const STAGING_ROOT = "staging/v1";

export function generationPrefix(month: string, generation: string): string {
  return `${DATASET_ROOT}/month=${month}/generation=${generation}`;
}

export function rawChunkPrefix(month: string, generation: string): string {
  return `${STAGING_ROOT}/month=${month}/generation=${generation}/raw/`;
}

export function rawChunkKey(
  month: string,
  generation: string,
  cursorFrom: number,
  cursorThrough: number,
): string {
  const from = String(cursorFrom).padStart(12, "0");
  const through = String(cursorThrough).padStart(12, "0");
  return `${rawChunkPrefix(month, generation)}${from}-${through}.json`;
}

export function wineProjectionKey(month: string, generation: string, wineId: number): string {
  return `${generationPrefix(month, generation)}/wines/${wineId}.json`;
}

export function monopolyProjectionKey(
  month: string,
  generation: string,
  monopolyId: number,
): string {
  return `${generationPrefix(month, generation)}/monopolies/${monopolyId}.json`;
}

export function manifestKey(month: string, generation: string): string {
  return `${generationPrefix(month, generation)}/manifest.json`;
}

export function catalogKey(catalog: "wines" | "monopolies", generation: string): string {
  return `catalog/v1/generation=${generation}/${catalog}.json`;
}
