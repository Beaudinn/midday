"use client";

import { Badge } from "@midday/ui/badge";
import { Button } from "@midday/ui/button";
import { Progress } from "@midday/ui/progress";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TaxDeclarationOrderAction } from "@/components/tax/tax-declaration-order-action";
import { useTRPC } from "@/trpc/client";

function label(value?: string | null) {
  return value?.replaceAll("_", " ") ?? "-";
}

function progressValue(
  progress?: {
    totalRequired: number;
    completedRequired: number;
  } | null,
) {
  if (!progress?.totalRequired) {
    return 0;
  }

  return Math.round(
    (progress.completedRequired / progress.totalRequired) * 100,
  );
}

function declarationTitle(type: string, taxYear: number) {
  switch (type) {
    case "income_tax_private":
      return `Income tax ${taxYear}`;
    case "income_tax_entrepreneur":
      return `Entrepreneur income tax ${taxYear}`;
    case "vat_return":
      return `VAT return ${taxYear}`;
    default:
      return `${label(type)} ${taxYear}`;
  }
}

function serviceOrderTitle(productCode: string, taxYear?: number | null) {
  return declarationTitle(productCode, taxYear ?? new Date().getFullYear());
}

export function TaxOverview() {
  const trpc = useTRPC();
  const { data: team } = useSuspenseQuery(trpc.team.current.queryOptions());
  const { data: taxClient } = useSuspenseQuery(trpc.tax.current.queryOptions());

  if (!taxClient) {
    return (
      <div className="py-8">
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-end">
          <div>
            <h1 className="font-serif text-3xl">Aangiftes</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
              Bestel een inkomstenbelastingdossier en vul daarna direct de
              intake in. Documenten blijven in Vault.
            </p>
          </div>
          <TaxDeclarationOrderAction
            workspaceType={team?.workspaceType}
            plan={team?.plan}
            declarations={[]}
            serviceOrders={[]}
            entitlements={[]}
          />
        </div>

        <div className="border border-dashed border-border p-10 text-center">
          <h2 className="font-medium">Nog geen aangiftedossiers</h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground text-sm">
            Start met bestellen. Daarna maken we automatisch het fiscale
            klantprofiel, de machtigingen, taken en intake aan.
          </p>
        </div>
      </div>
    );
  }

  const incomeTaxDeclarations = taxClient.declarations.filter(
    (declaration) =>
      declaration.declarationType === "income_tax_private" ||
      declaration.declarationType === "income_tax_entrepreneur",
  );
  const serviceOrders = taxClient.serviceOrders ?? [];
  const pendingServiceOrders = serviceOrders.filter(
    (serviceOrder) =>
      (serviceOrder.productCode === "income_tax_private" ||
        serviceOrder.productCode === "income_tax_entrepreneur") &&
      (serviceOrder.status === "draft" || serviceOrder.status === "ordered"),
  );

  return (
    <div className="py-8">
      <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-end">
        <div>
          <h1 className="font-serif text-3xl">Aangiftes</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            Jaargebonden dossiers voor inkomstenbelasting. Vault blijft de plek
            voor alle documenten; hier koppel je stukken en beantwoord je alleen
            wat nodig is voor het dossier.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/vault">Open Vault</Link>
          </Button>
          <TaxDeclarationOrderAction
            workspaceType={team?.workspaceType}
            clientKind={taxClient.clientKind}
            plan={team?.plan}
            declarations={taxClient.declarations}
            serviceOrders={serviceOrders}
            entitlements={taxClient.entitlements}
          />
        </div>
      </div>

      {pendingServiceOrders.length > 0 && (
        <div className="mb-6 grid gap-3">
          {pendingServiceOrders.map((serviceOrder) => (
            <div
              key={serviceOrder.id}
              className="flex flex-col justify-between gap-3 border border-border bg-muted/20 p-4 md:flex-row md:items-center"
            >
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Bestelling</Badge>
                  <Badge variant="outline">{label(serviceOrder.status)}</Badge>
                </div>
                <h2 className="font-medium">
                  {serviceOrderTitle(
                    serviceOrder.productCode,
                    serviceOrder.taxYear,
                  )}
                </h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  Nog geen actieve intake. De bestelling wordt gekoppeld zodra
                  betaling of backoffice-activatie is verwerkt.
                </p>
              </div>
              <Button variant="outline" disabled>
                {serviceOrder.polarProductId
                  ? "Betaling afronden"
                  : "Wacht op betaling"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {incomeTaxDeclarations.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {incomeTaxDeclarations.map((declaration) => {
            const progress = progressValue(declaration.intake?.progress);

            return (
              <Link
                key={declaration.id}
                href={`/tax/${declaration.id}`}
                className="group border border-border p-5 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {label(declaration.status)}
                      </Badge>
                      {declaration.intake && (
                        <Badge variant="outline">
                          Intake {label(declaration.intake.status)}
                        </Badge>
                      )}
                    </div>
                    <h2 className="font-medium text-lg">
                      {declarationTitle(
                        declaration.declarationType,
                        declaration.taxYear,
                      )}
                    </h2>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {declaration.deadlineDate
                        ? `Deadline ${declaration.deadlineDate}`
                        : "No deadline set"}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-sm group-hover:text-primary">
                    Open
                  </span>
                </div>

                {declaration.intake?.progress && (
                  <div className="mt-5">
                    <div className="mb-2 flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Required questions
                      </span>
                      <span>
                        {declaration.intake.progress.completedRequired}/
                        {declaration.intake.progress.totalRequired}
                      </span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                    {declaration.intake.progress.suggestedAnswers > 0 && (
                      <p className="mt-2 text-amber-600 text-xs dark:text-amber-400">
                        {declaration.intake.progress.suggestedAnswers} document
                        suggestions waiting for confirmation
                      </p>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-border p-10 text-center">
          <h2 className="font-medium">Geen IB-dossiers</h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground text-sm">
            Bestel een aangifte om direct de intake te starten. Bestaande
            machtigingen en documenten worden daarna aan het dossier gekoppeld.
          </p>
        </div>
      )}
    </div>
  );
}
