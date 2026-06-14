"use client";

import { Button } from "@midday/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/client";

type WorkspaceType = "business" | "personal" | "household";
type TaxClientKind =
  | "private_person"
  | "household"
  | "sole_proprietor"
  | "company";
type TaxProductCode =
  | "vat_return"
  | "income_tax_private"
  | "income_tax_entrepreneur";

function defaultClientKind(workspaceType: WorkspaceType): TaxClientKind {
  switch (workspaceType) {
    case "personal":
      return "private_person";
    case "household":
      return "household";
    default:
      return "sole_proprietor";
  }
}

function incomeTaxProduct(workspaceType: WorkspaceType): TaxProductCode {
  return workspaceType === "business"
    ? "income_tax_entrepreneur"
    : "income_tax_private";
}

export function AdminTaxClientActions({
  teamId,
  workspaceType,
  hasTaxClient,
  activeProductCodes,
}: {
  teamId: string;
  workspaceType: WorkspaceType;
  hasTaxClient: boolean;
  activeProductCodes: string[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const activateClientMutation = useMutation(
    trpc.admin.activateTaxClient.mutationOptions({
      onSettled: () => {
        setPendingAction(null);
        router.refresh();
      },
    }),
  );

  const activateServiceMutation = useMutation(
    trpc.admin.activateTaxService.mutationOptions({
      onSettled: () => {
        setPendingAction(null);
        router.refresh();
      },
    }),
  );

  const isPending =
    activateClientMutation.isPending || activateServiceMutation.isPending;

  const activateClient = (clientKind: TaxClientKind) => {
    setPendingAction(clientKind);
    activateClientMutation.mutate({ teamId, clientKind });
  };

  const activateService = (productCode: TaxProductCode) => {
    setPendingAction(productCode);
    activateServiceMutation.mutate({
      teamId,
      productCode,
      clientKind: defaultClientKind(workspaceType),
    });
  };

  if (!hasTaxClient) {
    if (workspaceType === "business") {
      return (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => activateClient("sole_proprietor")}
          >
            {pendingAction === "sole_proprietor" ? "..." : "ZZP"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => activateClient("company")}
          >
            {pendingAction === "company" ? "..." : "Company"}
          </Button>
        </div>
      );
    }

    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => activateClient(defaultClientKind(workspaceType))}
      >
        {isPending ? "Activating" : "Activate"}
      </Button>
    );
  }

  const needsVat =
    workspaceType === "business" && !activeProductCodes.includes("vat_return");
  const ibCode = incomeTaxProduct(workspaceType);
  const needsIncomeTax = !activeProductCodes.includes(ibCode);

  if (!needsVat && !needsIncomeTax) {
    return <span className="text-xs text-muted-foreground">Ready</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {needsVat && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => activateService("vat_return")}
        >
          {pendingAction === "vat_return" ? "..." : "Add VAT"}
        </Button>
      )}

      {needsIncomeTax && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => activateService(ibCode)}
        >
          {pendingAction === ibCode ? "..." : "Add IB"}
        </Button>
      )}
    </div>
  );
}
