/**
 * Deterministic mulberry32 PRNG — do not use Math.random() in seed logic.
 */
export type SeedRandom = {
  next: () => number;
  int: (minInclusive: number, maxInclusive: number) => number;
  pick: <T>(items: readonly T[]) => T;
  sample: <T>(items: readonly T[], count: number) => T[];
  shuffle: <T>(items: readonly T[]) => T[];
  chance: (probability: number) => boolean;
};

export const createSeedRandom = (seed: number): SeedRandom => {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (minInclusive: number, maxInclusive: number): number => {
    if (maxInclusive < minInclusive) {
      throw new Error("int: max < min");
    }
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(next() * span);
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error("pick: empty");
    }
    return items[int(0, items.length - 1)]!;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      const tmp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = tmp;
    }
    return copy;
  };

  const sample = <T>(items: readonly T[], count: number): T[] => {
    if (count <= 0) {
      return [];
    }
    if (count >= items.length) {
      return shuffle(items);
    }
    return shuffle(items).slice(0, count);
  };

  const chance = (probability: number): boolean => next() < probability;

  return { next, int, pick, sample, shuffle, chance };
};
