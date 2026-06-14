import { randomUUID } from "node:crypto";
import type {
  TaxDigipoortJobExecutionContext,
  TaxDigipoortJobExecutionResult,
} from "@midday/db/queries";
import { resolveDigipoortTransportConfig } from "./config";
import {
  getDigipoortBodyTemplate,
  getDigipoortEnvelopeTemplate,
  getDigipoortSecurityHeaderTemplate,
  renderDigipoortXmlTemplate,
} from "./templates";
import { buildDigipoortSoapEnvelope, DigipoortWusClient } from "./wus-client";

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function buildTemplateContext(
  context: TaxDigipoortJobExecutionContext,
  messageId: string,
) {
  return {
    messageId,
    job: {
      id: context.job.id,
      operation: context.job.operation,
      teamId: context.job.teamId,
      payload: context.job.payload,
    },
    mandate: context.mandate,
    subject: context.subject,
    activationCode: context.mandate.activationCode,
    intermediair: {
      oin: getEnv("DIGIPOORT_INTERMEDIAIR_OIN"),
      rsin: getEnv("DIGIPOORT_INTERMEDIAIR_RSIN"),
      kvkNumber: getEnv("DIGIPOORT_INTERMEDIAIR_KVK"),
      name: getEnv("DIGIPOORT_INTERMEDIAIR_NAME"),
    },
  };
}

export async function executeDigipoortOperation(
  context: TaxDigipoortJobExecutionContext,
): Promise<TaxDigipoortJobExecutionResult> {
  const messageId = `uuid:${randomUUID()}`;
  const config = await resolveDigipoortTransportConfig(context.job.operation);
  const templateContext = buildTemplateContext(context, messageId);
  const bodyTemplate = await getDigipoortBodyTemplate(context.job.operation);
  const bodyXml = renderDigipoortXmlTemplate(bodyTemplate, templateContext);
  const securityHeaderTemplate = await getDigipoortSecurityHeaderTemplate(
    context.job.operation,
  );
  const securityHeaderXml = securityHeaderTemplate
    ? renderDigipoortXmlTemplate(securityHeaderTemplate, templateContext)
    : undefined;
  const envelopeTemplate = await getDigipoortEnvelopeTemplate(
    context.job.operation,
  );
  const envelopeXml = envelopeTemplate
    ? renderDigipoortXmlTemplate(envelopeTemplate, {
        ...templateContext,
        bodyXml,
        securityHeaderXml: securityHeaderXml ?? "",
      })
    : buildDigipoortSoapEnvelope(config, {
        bodyXml,
        messageId,
        operation: context.job.operation,
        securityHeaderXml,
      });
  const client = new DigipoortWusClient(config);
  const response = await client.send({
    bodyXml,
    envelopeXml,
    messageId,
    operation: context.job.operation,
    securityHeaderXml,
  });

  if (!response.ok) {
    throw new Error(
      `Digipoort ${context.job.operation} returned HTTP ${response.statusCode}`,
    );
  }

  return {
    providerReference: response.providerReference ?? messageId,
    result: {
      dryRun: false,
      accepted: true,
      mode: config.mode,
      httpStatus: response.statusCode,
      messageId,
      providerReference: response.providerReference,
    },
  };
}

export type { DigipoortOperation } from "./config";
