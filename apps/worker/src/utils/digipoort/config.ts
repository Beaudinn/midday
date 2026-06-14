import { readFile } from "node:fs/promises";

export type DigipoortOperation =
  | "request_mandate"
  | "activate_mandate"
  | "fetch_service_messages"
  | "submit_return";

export type DigipoortMode = "dry-run" | "preproduction" | "production";

export type DigipoortSoapVersion = "1.1" | "1.2";

export type DigipoortTransportConfig = {
  mode: DigipoortMode;
  endpointUrl: string;
  soapAction: string | null;
  soapVersion: DigipoortSoapVersion;
  timeoutMs: number;
  rejectUnauthorized: boolean;
  pfx?: Buffer;
  cert?: Buffer;
  key?: Buffer;
  ca?: Buffer;
  passphrase?: string;
};

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

function resolveMode(): DigipoortMode {
  const rawMode = getEnv("DIGIPOORT_MODE");

  if (
    rawMode === "dry-run" ||
    rawMode === "preproduction" ||
    rawMode === "production"
  ) {
    return rawMode;
  }

  if (
    process.env.DIGIPOORT_DRY_RUN === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.DIGIPOORT_DRY_RUN !== "false")
  ) {
    return "dry-run";
  }

  return "production";
}

async function readMaybeSecret(
  value?: string,
  path?: string,
  base64?: string,
): Promise<Buffer | undefined> {
  if (value) {
    return Buffer.from(value);
  }

  if (base64) {
    return Buffer.from(base64, "base64");
  }

  if (path) {
    return readFile(path);
  }

  return undefined;
}

function resolveSoapVersion(): DigipoortSoapVersion {
  const soapVersion = getEnv("DIGIPOORT_SOAP_VERSION");

  if (soapVersion === "1.2") {
    return "1.2";
  }

  return "1.1";
}

function resolveRejectUnauthorized(mode: DigipoortMode) {
  const raw = getEnv("DIGIPOORT_TLS_REJECT_UNAUTHORIZED");

  if (raw === "false") {
    if (mode === "production") {
      throw new Error(
        "DIGIPOORT_TLS_REJECT_UNAUTHORIZED=false is not allowed in production",
      );
    }

    return false;
  }

  return true;
}

export async function resolveDigipoortTransportConfig(
  operation: DigipoortOperation,
): Promise<DigipoortTransportConfig> {
  const mode = resolveMode();
  const endpointUrl =
    getOperationEnv(operation, "ENDPOINT_URL") ??
    getEnv("DIGIPOORT_WUS_ENDPOINT_URL");

  if (!endpointUrl) {
    throw new Error(
      `Digipoort endpoint is not configured for ${operation}. Set DIGIPOORT_${operationEnvPrefix[operation]}_ENDPOINT_URL or DIGIPOORT_WUS_ENDPOINT_URL.`,
    );
  }

  const timeoutMs = Number(getEnv("DIGIPOORT_TIMEOUT_MS") ?? "30000");
  const passphrase = getEnv("DIGIPOORT_CERT_PASSPHRASE");
  const pfx = await readMaybeSecret(
    undefined,
    getEnv("DIGIPOORT_PFX_PATH"),
    getEnv("DIGIPOORT_PFX_BASE64"),
  );
  const cert = await readMaybeSecret(
    getEnv("DIGIPOORT_CERT_PEM"),
    getEnv("DIGIPOORT_CERT_PATH"),
    getEnv("DIGIPOORT_CERT_BASE64"),
  );
  const key = await readMaybeSecret(
    getEnv("DIGIPOORT_KEY_PEM"),
    getEnv("DIGIPOORT_KEY_PATH"),
    getEnv("DIGIPOORT_KEY_BASE64"),
  );
  const ca = await readMaybeSecret(
    getEnv("DIGIPOORT_CA_PEM"),
    getEnv("DIGIPOORT_CA_PATH"),
    getEnv("DIGIPOORT_CA_BASE64"),
  );

  if (!pfx && !(cert && key)) {
    throw new Error(
      "Digipoort client certificate is not configured. Use DIGIPOORT_PFX_PATH/DIGIPOORT_PFX_BASE64 or DIGIPOORT_CERT_PATH plus DIGIPOORT_KEY_PATH.",
    );
  }

  return {
    mode,
    endpointUrl,
    soapAction:
      getOperationEnv(operation, "SOAP_ACTION") ??
      getEnv("DIGIPOORT_WUS_SOAP_ACTION") ??
      null,
    soapVersion: resolveSoapVersion(),
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 30000,
    rejectUnauthorized: resolveRejectUnauthorized(mode),
    ...(pfx && { pfx }),
    ...(cert && { cert }),
    ...(key && { key }),
    ...(ca && { ca }),
    ...(passphrase && { passphrase }),
  };
}
