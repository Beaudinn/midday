import { readFile } from "node:fs/promises";
import type { DigipoortOperation } from "./config";

type TemplateContext = Record<string, unknown>;

const operationEnvPrefix: Record<DigipoortOperation, string> = {
  request_mandate: "REQUEST_MANDATE",
  activate_mandate: "ACTIVATE_MANDATE",
  fetch_service_messages: "FETCH_SERVICE_MESSAGES",
  submit_return: "SUBMIT_RETURN",
};

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getOperationEnv(operation: DigipoortOperation, suffix: string) {
  return getEnv(`DIGIPOORT_${operationEnvPrefix[operation]}_${suffix}`);
}

async function readTemplate(value?: string, path?: string) {
  if (value) {
    return value;
  }

  if (path) {
    return readFile(path, "utf8");
  }

  return undefined;
}

function flattenContext(
  value: unknown,
  path: string[] = [],
  target: Record<string, string> = {},
) {
  if (value === null || value === undefined) {
    target[path.join(".")] = "";
    return target;
  }

  if (typeof value !== "object" || value instanceof Date) {
    target[path.join(".")] = String(value);
    return target;
  }

  for (const [key, nested] of Object.entries(value)) {
    flattenContext(nested, [...path, key], target);
  }

  return target;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderDigipoortXmlTemplate(
  template: string,
  context: TemplateContext,
) {
  const values = flattenContext(context);

  return template
    .replaceAll(/\{\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\}/g, (_match, key) => {
      return values[key] ?? "";
    })
    .replaceAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
      return escapeXml(values[key] ?? "");
    });
}

export async function getDigipoortBodyTemplate(operation: DigipoortOperation) {
  const template = await readTemplate(
    getOperationEnv(operation, "BODY_TEMPLATE"),
    getOperationEnv(operation, "BODY_TEMPLATE_PATH"),
  );

  if (!template) {
    throw new Error(
      `Digipoort XML body template is not configured for ${operation}. Set DIGIPOORT_${operationEnvPrefix[operation]}_BODY_TEMPLATE_PATH from the Aansluit Suite service description.`,
    );
  }

  return template;
}

export async function getDigipoortEnvelopeTemplate(
  operation: DigipoortOperation,
) {
  return readTemplate(
    getOperationEnv(operation, "ENVELOPE_TEMPLATE"),
    getOperationEnv(operation, "ENVELOPE_TEMPLATE_PATH"),
  );
}

export async function getDigipoortSecurityHeaderTemplate(
  operation: DigipoortOperation,
) {
  return readTemplate(
    getOperationEnv(operation, "SECURITY_HEADER_TEMPLATE") ??
      getEnv("DIGIPOORT_WUS_SECURITY_HEADER_TEMPLATE"),
    getOperationEnv(operation, "SECURITY_HEADER_TEMPLATE_PATH") ??
      getEnv("DIGIPOORT_WUS_SECURITY_HEADER_TEMPLATE_PATH"),
  );
}
