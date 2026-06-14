import { describe, expect, it } from "bun:test";
import { renderDigipoortXmlTemplate } from "./templates";
import { buildDigipoortSoapEnvelope } from "./wus-client";

describe("Digipoort XML templates", () => {
  it("escapes normal placeholders and preserves raw XML placeholders", () => {
    const rendered = renderDigipoortXmlTemplate(
      "<root><name>{{subject.displayName}}</name>{{{bodyXml}}}</root>",
      {
        subject: {
          displayName: "A & B <test>",
        },
        bodyXml: "<child>raw</child>",
      },
    );

    expect(rendered).toBe(
      "<root><name>A &amp; B &lt;test&gt;</name><child>raw</child></root>",
    );
  });
});

describe("Digipoort WUS envelope", () => {
  it("builds a SOAP 1.1 envelope with WS-Addressing headers", () => {
    const envelope = buildDigipoortSoapEnvelope(
      {
        endpointUrl: "https://digipoort.example.test/wus",
        soapAction: "urn:test-action",
        soapVersion: "1.1",
      },
      {
        bodyXml: "<m:test />",
        messageId: "uuid:test",
        operation: "request_mandate",
      },
    );

    expect(envelope).toContain(
      'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"',
    );
    expect(envelope).toContain("<wsa:Action>urn:test-action</wsa:Action>");
    expect(envelope).toContain("<wsa:MessageID>uuid:test</wsa:MessageID>");
    expect(envelope).toContain("<soap:Body><m:test /></soap:Body>");
  });
});
