const NUMERIC_CATEGORY_PATTERN = /(?:^|\D)([1-6])(?:[LR])?(?=$|\D)/gi;

export const numericCategories = (...values: Array<string | null | undefined>): string[] => {
  const categories = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    for (const match of value.matchAll(NUMERIC_CATEGORY_PATTERN)) {
      if (match[1]) categories.add(match[1]);
    }
  }

  return [...categories].sort((left, right) => Number(left) - Number(right));
};
