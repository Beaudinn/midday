import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { loadDocument } from "./loaders/loader";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
});

const mandateLetterExtractionSchema = z.object({
  activationCode: z
    .string()
    .nullable()
    .describe(
      "The activation code/machtigingscode printed on the Dutch tax authorization letter. Return only the code, not surrounding labels.",
    ),
  mandateType: z
    .enum(["VIA", "SBA", "BTW", "IB"])
    .nullable()
    .describe(
      "The authorization type this letter appears to be about: VIA, SBA, BTW or IB.",
    ),
  letterDate: z
    .string()
    .nullable()
    .describe("The letter date in YYYY-MM-DD format if visible."),
  taxYear: z
    .number()
    .int()
    .nullable()
    .describe("The tax year/aangiftejaar if the letter is year-specific."),
  externalReference: z
    .string()
    .nullable()
    .describe("Any visible request/reference/kenmerk number on the letter."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence that the extracted activation code is correct."),
  reason: z
    .string()
    .nullable()
    .describe(
      "Short reason when no activation code was found or confidence is low.",
    ),
});

export type MandateLetterExtraction = z.infer<
  typeof mandateLetterExtractionSchema
>;

function normalizeActivationCode(code: string | null) {
  const normalized = code
    ?.trim()
    .replace(/[\s-]+/g, "")
    .toUpperCase();

  return normalized && normalized.length >= 4 ? normalized : null;
}

function extractCodeWithRegex(content: string) {
  const patterns = [
    /(?:machtigingscode|activeringscode|activatiecode|activation code)\s*[:-]?\s*([A-Z0-9][A-Z0-9\s-]{3,24})/i,
    /\b([A-Z0-9]{4}[\s-]?[A-Z0-9]{4}[\s-]?[A-Z0-9]{0,8})\b/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    const code = normalizeActivationCode(match?.at(1) ?? null);

    if (code) {
      return code;
    }
  }

  return null;
}

function extractTaxYearWithRegex(content: string) {
  const match = content.match(
    /(?:belastingjaar|aangiftejaar|fiscaal jaar|jaar van aangifte)\s*[:-]?\s*((?:19|20)\d{2})/i,
  );

  return match?.[1] ? Number(match[1]) : null;
}

function inferMandateTypeFromText(content: string) {
  const value = content.toLowerCase();

  if (value.includes("vooraf ingevulde aangifte") || value.includes("via")) {
    return "VIA" as const;
  }

  if (value.includes("servicebericht") || value.includes("sba")) {
    return "SBA" as const;
  }

  if (value.includes("btw") || value.includes("omzetbelasting")) {
    return "BTW" as const;
  }

  if (value.includes("inkomstenbelasting") || value.includes(" ib ")) {
    return "IB" as const;
  }

  return null;
}

export async function extractMandateActivationCode({
  content,
  mimetype,
  expectedMandateType,
}: {
  content: Blob;
  mimetype: string;
  expectedMandateType?: "VIA" | "SBA" | "BTW" | "IB" | null;
}): Promise<MandateLetterExtraction> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    if (mimetype.startsWith("text/")) {
      const text = await content.text();
      const activationCode = extractCodeWithRegex(text);
      const taxYear = extractTaxYearWithRegex(text);

      return {
        activationCode,
        mandateType:
          inferMandateTypeFromText(text) ?? expectedMandateType ?? null,
        letterDate: null,
        taxYear,
        externalReference: null,
        confidence: activationCode ? 0.65 : 0,
        reason: activationCode
          ? "Extracted with local text pattern matching."
          : "No Google API key configured and no activation code found in text.",
      };
    }

    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required for OCR.");
  }

  const systemPrompt = `You extract Dutch Belastingdienst authorization activation codes from letters uploaded by tax clients.

Return structured data only. The user may upload a photo, scan, PDF or text file.
Focus on labels such as machtigingscode, activeringscode, activatiecode, VIA, SBA, BTW, omzetbelasting and inkomstenbelasting.
If multiple codes are visible, choose the code belonging to the authorization letter.`;

  if (mimetype.startsWith("image/")) {
    const image = await content.arrayBuffer();
    const { object } = await generateObject({
      model: google("gemini-3-flash-preview"),
      schema: mandateLetterExtractionSchema,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Expected mandate type: ${expectedMandateType ?? "unknown"}. Extract the activation code from this image.`,
            },
            {
              type: "image",
              image,
            },
          ],
        },
      ],
    });

    return {
      ...object,
      activationCode: normalizeActivationCode(object.activationCode),
    };
  }

  const text =
    mimetype.startsWith("text/") ||
    mimetype === "application/pdf" ||
    mimetype === "application/x-pdf" ||
    mimetype.includes("word")
      ? await loadDocument({ content, metadata: { mimetype } })
      : await content.text().catch(() => null);

  const regexCode = text ? extractCodeWithRegex(text) : null;

  if (regexCode) {
    return {
      activationCode: regexCode,
      mandateType: text
        ? inferMandateTypeFromText(text)
        : (expectedMandateType ?? null),
      letterDate: null,
      taxYear: text ? extractTaxYearWithRegex(text) : null,
      externalReference: null,
      confidence: 0.75,
      reason: "Extracted with text pattern matching.",
    };
  }

  const { object } = await generateObject({
    model: google("gemini-3-flash-preview"),
    schema: mandateLetterExtractionSchema,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Expected mandate type: ${expectedMandateType ?? "unknown"}.

Extract the activation code from this document text:

${text ?? ""}`,
      },
    ],
  });

  return {
    ...object,
    activationCode: normalizeActivationCode(object.activationCode),
  };
}
