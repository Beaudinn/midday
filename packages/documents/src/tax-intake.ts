type SubjectScope = "primary" | "partner" | "joint" | "household";

export type TaxIntakeFactSuggestion = {
  sectionKey: string;
  questionKey: string;
  subjectScope: SubjectScope;
  value: unknown;
  confidence?: number | null;
  reason?: string | null;
};

export type TaxIntakeDocumentFactExtraction = {
  documentType: string | null;
  taxYear: number | null;
  sectionKey: string | null;
  subjectScope: SubjectScope | null;
  confidence: number;
  reason: string | null;
  suggestedAnswers: TaxIntakeFactSuggestion[];
  rawExtraction: Record<string, unknown>;
};

const countryHints = [
  "belgie",
  "duitsland",
  "frankrijk",
  "spanje",
  "portugal",
  "italie",
  "verenigd koninkrijk",
  "amerika",
  "verenigde staten",
  "turkije",
  "marokko",
  "suriname",
];

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function textIncludesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function inferTaxYear(text: string, documentDate?: string | null) {
  const years = [...text.matchAll(/\b(20\d{2}|19\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 2000 && year <= 2100);

  if (years.length) {
    return years[0] ?? null;
  }

  return documentDate ? Number(documentDate.slice(0, 4)) : null;
}

function parseMoneyNear(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label}[^0-9]{0,40}([0-9][0-9. ,]{1,14})`,
      "i",
    );
    const match = text.match(pattern);
    const raw = match?.[1]
      ?.replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    if (raw) {
      const value = Number.parseFloat(raw);

      if (Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}

function findCountries(text: string) {
  return countryHints.filter((country) => text.includes(country));
}

function addSuggestion(
  suggestions: TaxIntakeFactSuggestion[],
  suggestion: TaxIntakeFactSuggestion,
) {
  if (
    suggestions.some(
      (item) =>
        item.questionKey === suggestion.questionKey &&
        item.subjectScope === suggestion.subjectScope,
    )
  ) {
    return;
  }

  suggestions.push(suggestion);
}

export function extractTaxIntakeFactsFromDocument(params: {
  title?: string | null;
  summary?: string | null;
  content?: string | null;
  date?: string | null;
  expectedTaxYears?: number[];
}): TaxIntakeDocumentFactExtraction {
  const text = cleanText(
    [params.title, params.summary, params.content].filter(Boolean).join(" "),
  );
  const lower = text.toLowerCase();
  const suggestedAnswers: TaxIntakeFactSuggestion[] = [];
  let sectionKey: string | null = null;
  let documentType: string | null = null;
  let confidence = 0;
  const reasons: string[] = [];

  const inferredYear = inferTaxYear(lower, params.date);
  const taxYear =
    inferredYear && params.expectedTaxYears?.includes(inferredYear)
      ? inferredYear
      : (inferredYear ?? null);

  if (
    textIncludesAny(lower, [
      "woz",
      "eigen woning",
      "hypotheek",
      "hypotheekrente",
      "jaaropgave hypotheek",
    ])
  ) {
    sectionKey = "home";
    documentType = lower.includes("woz")
      ? "woz_statement"
      : "mortgage_statement";
    confidence = Math.max(confidence, 0.78);
    reasons.push("Own-home or mortgage terms found.");

    addSuggestion(suggestedAnswers, {
      sectionKey: "home",
      questionKey: "has_owner_occupied_home",
      subjectScope: "household",
      value: true,
      confidence: 0.78,
      reason: "Own-home document terms found.",
    });

    const wozValue = parseMoneyNear(lower, ["woz", "woz-waarde"]);
    if (wozValue !== null) {
      addSuggestion(suggestedAnswers, {
        sectionKey: "home",
        questionKey: "woz_value",
        subjectScope: "household",
        value: wozValue,
        confidence: 0.7,
        reason: "WOZ value pattern found.",
      });
    }

    const mortgageInterest = parseMoneyNear(lower, [
      "hypotheekrente",
      "betaalde rente",
      "rente",
    ]);
    if (mortgageInterest !== null) {
      addSuggestion(suggestedAnswers, {
        sectionKey: "home",
        questionKey: "mortgage_interest",
        subjectScope: "household",
        value: mortgageInterest,
        confidence: 0.68,
        reason: "Mortgage interest pattern found.",
      });
    }
  }

  if (
    textIncludesAny(lower, [
      "buitenlands vermogen",
      "buitenlandse bank",
      "foreign bank",
      "abroad",
      "buitenland",
      "foreign assets",
      "dividendbelasting buitenland",
    ])
  ) {
    sectionKey = sectionKey ?? "box3";
    documentType = documentType ?? "foreign_asset_statement";
    confidence = Math.max(confidence, 0.76);
    reasons.push("Foreign asset terms found.");

    addSuggestion(suggestedAnswers, {
      sectionKey: "box3",
      questionKey: "has_box3_assets",
      subjectScope: "household",
      value: true,
      confidence: 0.7,
      reason: "Foreign assets imply box 3 review.",
    });
    addSuggestion(suggestedAnswers, {
      sectionKey: "box3",
      questionKey: "has_foreign_assets",
      subjectScope: "household",
      value: true,
      confidence: 0.76,
      reason: "Foreign asset terms found.",
    });

    const countries = findCountries(lower);
    if (countries.length) {
      addSuggestion(suggestedAnswers, {
        sectionKey: "box3",
        questionKey: "foreign_asset_countries",
        subjectScope: "household",
        value: countries.join(", "),
        confidence: 0.62,
        reason: "Country names found near foreign asset context.",
      });
    }
  }

  if (
    textIncludesAny(lower, [
      "m-biljet",
      "m formulier",
      "m-form",
      "emigratie",
      "immigratie",
      "verhuisd naar nederland",
      "verhuisd uit nederland",
      "migratie",
    ])
  ) {
    sectionKey = sectionKey ?? "migration";
    documentType = documentType ?? "migration_document";
    confidence = Math.max(confidence, 0.8);
    reasons.push("Migration or M-form terms found.");

    addSuggestion(suggestedAnswers, {
      sectionKey: "migration",
      questionKey: "migrated",
      subjectScope: "primary",
      value: true,
      confidence: 0.8,
      reason: "Migration terms found.",
    });

    const migrationType = lower.includes("immigr")
      ? "immigration"
      : lower.includes("emigr")
        ? "emigration"
        : null;
    if (migrationType) {
      addSuggestion(suggestedAnswers, {
        sectionKey: "migration",
        questionKey: "migration_type",
        subjectScope: "primary",
        value: migrationType,
        confidence: 0.66,
        reason: "Migration direction term found.",
      });
    }
  }

  if (
    textIncludesAny(lower, [
      "fiscaal partner",
      "echtgenoot",
      "geregistreerd partner",
      "samenwonend",
      "partnerschap",
    ])
  ) {
    sectionKey = sectionKey ?? "partner";
    documentType = documentType ?? "partner_document";
    confidence = Math.max(confidence, 0.68);
    reasons.push("Partner relationship terms found.");

    addSuggestion(suggestedAnswers, {
      sectionKey: "partner",
      questionKey: "has_fiscal_partner",
      subjectScope: "household",
      value: true,
      confidence: 0.68,
      reason: "Fiscal partner terms found.",
    });
  }

  if (
    textIncludesAny(lower, [
      "jaaropgave",
      "loonheffing",
      "loonbelasting",
      "uitkering",
      "pensioen",
      "aow",
    ])
  ) {
    sectionKey = sectionKey ?? "income";
    documentType = documentType ?? "income_statement";
    confidence = Math.max(confidence, 0.72);
    reasons.push("Income statement terms found.");

    addSuggestion(suggestedAnswers, {
      sectionKey: "income",
      questionKey:
        lower.includes("pensioen") || lower.includes("uitkering")
          ? "benefits_or_pension"
          : "employment_income",
      subjectScope: "primary",
      value: true,
      confidence: 0.72,
      reason: "Income document terms found.",
    });
  }

  if (
    textIncludesAny(lower, [
      "gift",
      "giften",
      "zorgkosten",
      "alimentatie",
      "aftrekpost",
      "donatie",
    ])
  ) {
    sectionKey = sectionKey ?? "deductions";
    documentType = documentType ?? "deduction_document";
    confidence = Math.max(confidence, 0.68);
    reasons.push("Deduction terms found.");

    addSuggestion(suggestedAnswers, {
      sectionKey: "deductions",
      questionKey: "has_deductions",
      subjectScope: "primary",
      value: true,
      confidence: 0.68,
      reason: "Deduction terms found.",
    });
  }

  return {
    documentType,
    taxYear,
    sectionKey,
    subjectScope: sectionKey === "partner" ? "household" : "primary",
    confidence,
    reason: reasons.join(" ") || null,
    suggestedAnswers,
    rawExtraction: {
      title: params.title ?? null,
      date: params.date ?? null,
      textSample: text.slice(0, 1000),
      reasons,
    },
  };
}
