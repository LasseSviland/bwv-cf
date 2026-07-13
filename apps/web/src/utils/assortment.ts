import type { MonopolySummary, WineSummary } from "../api/types";

export type AssortmentStatus = "required" | "additional" | "unknown";

export interface AssortmentClassification {
  status: AssortmentStatus;
  explanation: string;
}

interface ParsedGrade {
  category: number;
  profile: "L" | "R" | null;
  code: string;
}

const OPTIONAL_ASSORTMENT_PATTERN = /bestillings|tilleggs|spesial/i;

const parsedGrades = (wine: WineSummary): ParsedGrade[] => {
  const values =
    wine.assortmentGrades && wine.assortmentGrades.length > 0
      ? wine.assortmentGrades
      : wine.wineCategory
        ? [wine.wineCategory]
        : [];
  const grades = values.flatMap((value) =>
    [...value.matchAll(/(?:SB)?([1-6])([LR])?/gi)].map((match) => ({
      category: Number(match[1]),
      profile: (match[2]?.toUpperCase() as "L" | "R" | undefined) ?? null,
      code: `${match[1]}${match[2]?.toUpperCase() ?? ""}`,
    })),
  );
  return [...new Map(grades.map((grade) => [grade.code, grade])).values()];
};

const storeCategory = (monopoly: MonopolySummary): number | null => {
  const match = (monopoly.monopolyCategory ?? monopoly.storeAssortment ?? "").match(/[1-6]/);
  return match ? Number(match[0]) : null;
};

const storeProfile = (monopoly: MonopolySummary): "L" | "R" | null => {
  const assortmentMatch = monopoly.storeAssortment?.match(/[1-6]\s*([LR])/i);
  if (assortmentMatch?.[1]) return assortmentMatch[1].toUpperCase() as "L" | "R";
  const normalized = monopoly.monopolyProfile?.toLocaleLowerCase("nb-NO") ?? "";
  if (normalized.includes("lyst") || normalized.includes("lett")) return "L";
  if (normalized.includes("rødt") || normalized.includes("mørkt")) return "R";
  return null;
};

export const wineAssortmentLabel = (wine: WineSummary): string => {
  const grades = parsedGrades(wine).map(({ code }) => code);
  const gradeLabel = grades.length > 0 ? `category ${grades.join(" / ")}` : null;
  return [wine.assortment, gradeLabel].filter(Boolean).join(" · ") || "Category unavailable";
};

export const storeAssortmentLabel = (monopoly: MonopolySummary): string => {
  const assortment = monopoly.storeAssortment?.trim();
  if (assortment) return `Store category ${assortment}`;
  const category = monopoly.monopolyCategory?.trim();
  const profile = monopoly.monopolyProfile?.trim();
  if (category && profile) return `Store category ${category} · ${profile}`;
  if (category) return `Store category ${category}`;
  return "Store category unavailable";
};

export const classifyWineForStore = (
  wine: WineSummary,
  monopoly: MonopolySummary,
): AssortmentClassification => {
  const category = storeCategory(monopoly);
  const profile = storeProfile(monopoly);
  const grades = parsedGrades(wine);
  const wineLabel = wineAssortmentLabel(wine);
  const monopolyLabel = storeAssortmentLabel(monopoly);

  if (category !== null && grades.length > 0) {
    const relevantGrades = profile
      ? grades.filter((grade) => grade.profile === null || grade.profile === profile)
      : grades;
    const required = relevantGrades.some((grade) => grade.category <= category);
    return required
      ? {
          status: "required",
          explanation: `Part of this store's fixed assortment (${wineLabel}; ${monopolyLabel}).`,
        }
      : {
          status: "additional",
          explanation: `Not part of this store's fixed assortment (${wineLabel}; ${monopolyLabel}).`,
        };
  }

  if (wine.assortment && OPTIONAL_ASSORTMENT_PATTERN.test(wine.assortment)) {
    return {
      status: "additional",
      explanation: `${wine.assortment} is optional local stock at this store.`,
    };
  }

  return {
    status: "unknown",
    explanation: "Category or profile data is missing, so sold-out status is not inferred.",
  };
};
