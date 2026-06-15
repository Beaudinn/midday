export const TAX_INTAKE_TEMPLATE_KEY = "nl_income_tax_intake";
export const TAX_INTAKE_TEMPLATE_VERSION = 1;

export type TaxIntakeSubjectScope =
  | "primary"
  | "partner"
  | "joint"
  | "household";

export type TaxIntakeQuestionType =
  | "boolean"
  | "text"
  | "date"
  | "number"
  | "select";

export type TaxIntakeRequiredWhen = {
  questionKey: string;
  equals: string | number | boolean | null;
};

export type TaxIntakeQuestion = {
  key: string;
  label: string;
  type: TaxIntakeQuestionType;
  scope: TaxIntakeSubjectScope;
  required?: boolean;
  requiredWhen?: TaxIntakeRequiredWhen;
  options?: { value: string; label: string }[];
  documentHints?: string[];
};

export type TaxIntakeSection = {
  key: string;
  title: string;
  description: string;
  questions: TaxIntakeQuestion[];
};

export type TaxIntakeTemplate = {
  key: typeof TAX_INTAKE_TEMPLATE_KEY;
  version: typeof TAX_INTAKE_TEMPLATE_VERSION;
  declarationTypes: ("income_tax_private" | "income_tax_entrepreneur")[];
  sections: TaxIntakeSection[];
};

export type TaxIntakeAnswerForProgress = {
  questionKey: string;
  subjectScope: TaxIntakeSubjectScope;
  value: unknown;
  status: "draft" | "suggested" | "confirmed" | "rejected" | "needs_review";
};

function wrapValue(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "value" in value
  ) {
    return value;
  }

  return { value };
}

export function normalizeTaxIntakeAnswerValue(value: unknown) {
  return wrapValue(value);
}

export function getTaxIntakeAnswerPrimitive(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "value" in value
  ) {
    return (value as { value: unknown }).value;
  }

  return value;
}

function hasMeaningfulValue(value: unknown) {
  const primitive = getTaxIntakeAnswerPrimitive(value);

  if (primitive === null || primitive === undefined) {
    return false;
  }

  if (typeof primitive === "string") {
    return primitive.trim().length > 0;
  }

  if (Array.isArray(primitive)) {
    return primitive.length > 0;
  }

  return true;
}

function primitiveEquals(value: unknown, expected: unknown) {
  return getTaxIntakeAnswerPrimitive(value) === expected;
}

function answerPriority(status: TaxIntakeAnswerForProgress["status"]) {
  switch (status) {
    case "confirmed":
      return 4;
    case "draft":
      return 3;
    case "needs_review":
      return 2;
    case "suggested":
      return 1;
    default:
      return 0;
  }
}

function getBestAnswers(answers: TaxIntakeAnswerForProgress[]) {
  const result = new Map<string, TaxIntakeAnswerForProgress>();

  for (const answer of answers) {
    if (answer.status === "rejected") {
      continue;
    }

    const existing = result.get(answer.questionKey);

    if (
      !existing ||
      answerPriority(answer.status) > answerPriority(existing.status)
    ) {
      result.set(answer.questionKey, answer);
    }
  }

  return result;
}

function isQuestionRequired(
  question: TaxIntakeQuestion,
  answersByQuestion: Map<string, TaxIntakeAnswerForProgress>,
) {
  if (question.required) {
    return true;
  }

  if (!question.requiredWhen) {
    return false;
  }

  const controller = answersByQuestion.get(question.requiredWhen.questionKey);

  return controller
    ? primitiveEquals(controller.value, question.requiredWhen.equals)
    : false;
}

export function isIncomeTaxIntakeDeclarationType(declarationType: string) {
  return (
    declarationType === "income_tax_private" ||
    declarationType === "income_tax_entrepreneur"
  );
}

export function getTaxIntakeTemplate(
  declarationType: "income_tax_private" | "income_tax_entrepreneur",
): TaxIntakeTemplate {
  const sections: TaxIntakeSection[] = [
    {
      key: "personal",
      title: "Personal and residency",
      description: "Confirm the taxpayer and Dutch residency basis.",
      questions: [
        {
          key: "identity_confirmed",
          label: "The personal details for this tax year are correct",
          type: "boolean",
          scope: "primary",
          required: true,
        },
        {
          key: "resident_nl_full_year",
          label: "Lived in the Netherlands for the full tax year",
          type: "boolean",
          scope: "primary",
          required: true,
        },
      ],
    },
    {
      key: "partner",
      title: "Fiscal partner and household",
      description: "Capture partner status for allocations and joint filing.",
      questions: [
        {
          key: "has_fiscal_partner",
          label: "Had a fiscal partner in this tax year",
          type: "boolean",
          scope: "household",
          required: true,
          documentHints: ["marriage", "registered partner", "cohabitation"],
        },
        {
          key: "partner_relationship_valid_for_year",
          label: "The partner relationship dates are correct for this year",
          type: "boolean",
          scope: "household",
          requiredWhen: { questionKey: "has_fiscal_partner", equals: true },
        },
        {
          key: "partner_can_review",
          label: "Partner may review or add intake information",
          type: "boolean",
          scope: "partner",
        },
      ],
    },
    {
      key: "migration",
      title: "Migration",
      description:
        "Determine whether an M-form or partial-year residency applies.",
      questions: [
        {
          key: "migrated",
          label: "Moved to or from the Netherlands during this tax year",
          type: "boolean",
          scope: "primary",
          required: true,
          documentHints: ["M-form", "emigration", "immigration"],
        },
        {
          key: "migration_type",
          label: "Migration direction",
          type: "select",
          scope: "primary",
          requiredWhen: { questionKey: "migrated", equals: true },
          options: [
            { value: "immigration", label: "Moved to the Netherlands" },
            { value: "emigration", label: "Moved from the Netherlands" },
            { value: "both", label: "Both during the year" },
          ],
        },
        {
          key: "migration_date",
          label: "Migration date",
          type: "date",
          scope: "primary",
          requiredWhen: { questionKey: "migrated", equals: true },
        },
        {
          key: "migration_country",
          label: "Country involved",
          type: "text",
          scope: "primary",
          requiredWhen: { questionKey: "migrated", equals: true },
        },
      ],
    },
    {
      key: "income",
      title: "Income and VIA",
      description: "Check income streams and pre-filled tax data.",
      questions: [
        {
          key: "via_requested",
          label: "Pre-filled tax data authorization has been requested",
          type: "boolean",
          scope: "primary",
          required: true,
        },
        {
          key: "employment_income",
          label: "Had employment income or a year statement",
          type: "boolean",
          scope: "primary",
          required: true,
          documentHints: ["jaaropgave", "annual salary statement"],
        },
        {
          key: "benefits_or_pension",
          label: "Had benefits, pension or annuity income",
          type: "boolean",
          scope: "primary",
          required: true,
          documentHints: ["UWV", "pension", "AOW"],
        },
      ],
    },
    {
      key: "home",
      title: "Own home",
      description: "Gather own-home and mortgage information.",
      questions: [
        {
          key: "has_owner_occupied_home",
          label: "Owned and lived in an own home",
          type: "boolean",
          scope: "household",
          required: true,
          documentHints: ["WOZ", "mortgage interest", "eigen woning"],
        },
        {
          key: "woz_value",
          label: "WOZ value",
          type: "number",
          scope: "household",
          requiredWhen: {
            questionKey: "has_owner_occupied_home",
            equals: true,
          },
        },
        {
          key: "mortgage_interest",
          label: "Deductible mortgage interest",
          type: "number",
          scope: "household",
          requiredWhen: {
            questionKey: "has_owner_occupied_home",
            equals: true,
          },
        },
      ],
    },
    {
      key: "box3",
      title: "Box 3 and foreign assets",
      description: "Capture savings, investments, debts and foreign assets.",
      questions: [
        {
          key: "has_box3_assets",
          label: "Had savings, investments, debts or other box 3 assets",
          type: "boolean",
          scope: "household",
          required: true,
          documentHints: ["bank statement", "investment statement"],
        },
        {
          key: "has_foreign_assets",
          label: "Had foreign assets or foreign income",
          type: "boolean",
          scope: "household",
          required: true,
          documentHints: ["foreign bank", "buitenland", "abroad"],
        },
        {
          key: "foreign_asset_countries",
          label: "Countries for foreign assets or income",
          type: "text",
          scope: "household",
          requiredWhen: { questionKey: "has_foreign_assets", equals: true },
        },
        {
          key: "box3_balance_notes",
          label: "Box 3 balance notes",
          type: "text",
          scope: "household",
          requiredWhen: { questionKey: "has_box3_assets", equals: true },
        },
      ],
    },
    {
      key: "deductions",
      title: "Deductions",
      description: "Identify deductible items that need evidence.",
      questions: [
        {
          key: "has_deductions",
          label: "Had deductible gifts, care costs, alimony or similar items",
          type: "boolean",
          scope: "primary",
          required: true,
          documentHints: ["gift", "healthcare", "alimony"],
        },
        {
          key: "deduction_notes",
          label: "Deduction details",
          type: "text",
          scope: "primary",
          requiredWhen: { questionKey: "has_deductions", equals: true },
        },
      ],
    },
    {
      key: "children",
      title: "Children and dependents",
      description: "Collect household facts that can affect allocations.",
      questions: [
        {
          key: "has_children",
          label: "Had children or dependents relevant for the tax return",
          type: "boolean",
          scope: "household",
          required: true,
        },
        {
          key: "children_notes",
          label: "Children or dependent details",
          type: "text",
          scope: "household",
          requiredWhen: { questionKey: "has_children", equals: true },
        },
      ],
    },
  ];

  if (declarationType === "income_tax_entrepreneur") {
    sections.push({
      key: "business",
      title: "Entrepreneur income",
      description:
        "High-level business facts before the detailed calculation flow.",
      questions: [
        {
          key: "has_business_income",
          label: "Had business income as an entrepreneur",
          type: "boolean",
          scope: "primary",
          required: true,
        },
        {
          key: "business_revenue_notes",
          label: "Revenue and bookkeeping notes",
          type: "text",
          scope: "primary",
          requiredWhen: { questionKey: "has_business_income", equals: true },
        },
        {
          key: "business_expense_notes",
          label: "Expense and asset notes",
          type: "text",
          scope: "primary",
          requiredWhen: { questionKey: "has_business_income", equals: true },
        },
      ],
    });
  }

  sections.push({
    key: "review",
    title: "Final check",
    description: "Confirm that the intake can be sent to Midway for review.",
    questions: [
      {
        key: "confirm_complete",
        label: "All relevant information and documents have been added",
        type: "boolean",
        scope: "household",
        required: true,
      },
    ],
  });

  return {
    key: TAX_INTAKE_TEMPLATE_KEY,
    version: TAX_INTAKE_TEMPLATE_VERSION,
    declarationTypes: ["income_tax_private", "income_tax_entrepreneur"],
    sections,
  };
}

export function flattenTaxIntakeQuestions(template: TaxIntakeTemplate) {
  return template.sections.flatMap((section) =>
    section.questions.map((question) => ({
      ...question,
      sectionKey: section.key,
      sectionTitle: section.title,
    })),
  );
}

export function getTaxIntakeProgress(
  template: TaxIntakeTemplate,
  answers: TaxIntakeAnswerForProgress[],
) {
  const questions = flattenTaxIntakeQuestions(template);
  const bestAnswers = getBestAnswers(answers);
  const requiredQuestions = questions.filter((question) =>
    isQuestionRequired(question, bestAnswers),
  );
  const missingQuestions = requiredQuestions.filter((question) => {
    const answer = bestAnswers.get(question.key);

    return !(
      answer &&
      answer.status === "confirmed" &&
      hasMeaningfulValue(answer.value)
    );
  });

  return {
    totalRequired: requiredQuestions.length,
    completedRequired: requiredQuestions.length - missingQuestions.length,
    missingRequired: missingQuestions.length,
    suggestedAnswers: answers.filter((answer) => answer.status === "suggested")
      .length,
    missingQuestions: missingQuestions.map((question) => ({
      sectionKey: question.sectionKey,
      questionKey: question.key,
      label: question.label,
      subjectScope: question.scope,
    })),
  };
}
