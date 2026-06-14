import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { DigipoortSoapVersion, DigipoortTransportConfig } from "./config";

type SoapRequest = {
  bodyXml: string;
  envelopeXml?: string;
  messageId: string;
  operation: string;
  securityHeaderXml?: string;
};

export type DigipoortSoapResponse = {
  ok: boolean;
  statusCode: number;
  providerReference: string | null;
  responseBodyPreview: string;
  headers: Record<string, string | string[] | undefined>;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function soapNamespace(version: DigipoortSoapVersion) {
  return version === "1.2"
    ? "http://www.w3.org/2003/05/soap-envelope"
    : "http://schemas.xmlsoap.org/soap/envelope/";
}

export function buildDigipoortSoapEnvelope(
  config: Pick<
    DigipoortTransportConfig,
    "endpointUrl" | "soapAction" | "soapVersion"
  >,
  request: SoapRequest,
) {
  if (request.envelopeXml) {
    return request.envelopeXml;
  }

  const actionHeader = config.soapAction
    ? `<wsa:Action>${escapeXml(config.soapAction)}</wsa:Action>`
    : "";
  const toHeader = `<wsa:To>${escapeXml(config.endpointUrl)}</wsa:To>`;
  const messageIdHeader = `<wsa:MessageID>${escapeXml(request.messageId)}</wsa:MessageID>`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<soap:Envelope xmlns:soap="${soapNamespace(config.soapVersion)}" xmlns:wsa="http://www.w3.org/2005/08/addressing">`,
    "<soap:Header>",
    actionHeader,
    messageIdHeader,
    toHeader,
    request.securityHeaderXml ?? "",
    "</soap:Header>",
    "<soap:Body>",
    request.bodyXml,
    "</soap:Body>",
    "</soap:Envelope>",
  ].join("");
}

function contentType(
  soapVersion: DigipoortSoapVersion,
  soapAction: string | null,
) {
  if (soapVersion === "1.2") {
    return soapAction
      ? `application/soap+xml; charset=utf-8; action="${soapAction}"`
      : "application/soap+xml; charset=utf-8";
  }

  return "text/xml; charset=utf-8";
}

function extractProviderReference(responseBody: string, fallback: string) {
  const patterns = [
    /<(?:[a-zA-Z0-9_-]+:)?berichtKenmerk>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?berichtKenmerk>/i,
    /<(?:[a-zA-Z0-9_-]+:)?kenmerk>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?kenmerk>/i,
    /<(?:[a-zA-Z0-9_-]+:)?referentie>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?referentie>/i,
    /<(?:[a-zA-Z0-9_-]+:)?MessageID>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?MessageID>/i,
  ];

  for (const pattern of patterns) {
    const match = responseBody.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return fallback;
}

export class DigipoortWusClient {
  constructor(private readonly config: DigipoortTransportConfig) {}

  async send(request: SoapRequest): Promise<DigipoortSoapResponse> {
    const envelopeXml = buildDigipoortSoapEnvelope(this.config, request);
    const url = new URL(this.config.endpointUrl);
    const body = Buffer.from(envelopeXml, "utf8");
    const isHttps = url.protocol === "https:";

    if (!isHttps && this.config.mode === "production") {
      throw new Error("Digipoort production endpoint must use HTTPS");
    }

    const headers: Record<string, string | number> = {
      "Content-Type": contentType(
        this.config.soapVersion,
        this.config.soapAction,
      ),
      "Content-Length": body.byteLength,
    };

    if (this.config.soapVersion === "1.1" && this.config.soapAction) {
      headers.SOAPAction = `"${this.config.soapAction}"`;
    }

    return new Promise((resolve, reject) => {
      const clientRequest = (isHttps ? httpsRequest : httpRequest)(
        {
          method: "POST",
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          headers,
          timeout: this.config.timeoutMs,
          ...(isHttps && {
            pfx: this.config.pfx,
            cert: this.config.cert,
            key: this.config.key,
            ca: this.config.ca,
            passphrase: this.config.passphrase,
            rejectUnauthorized: this.config.rejectUnauthorized,
          }),
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on("end", () => {
            const responseBody = Buffer.concat(chunks).toString("utf8");
            const statusCode = response.statusCode ?? 0;
            const ok = statusCode >= 200 && statusCode < 300;
            const providerReference = extractProviderReference(
              responseBody,
              request.messageId,
            );

            resolve({
              ok,
              statusCode,
              providerReference,
              responseBodyPreview: responseBody.slice(0, 1000),
              headers: response.headers,
            });
          });
        },
      );

      clientRequest.on("timeout", () => {
        clientRequest.destroy(
          new Error(
            `Digipoort ${request.operation} request timed out after ${this.config.timeoutMs}ms`,
          ),
        );
      });

      clientRequest.on("error", reject);
      clientRequest.end(body);
    });
  }
}
