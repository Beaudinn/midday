"use client";

import { Button } from "@midday/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@midday/ui/dialog";
import { Input } from "@midday/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@midday/ui/select";
import { useToast } from "@midday/ui/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTRPC } from "@/trpc/client";

type WorkspaceType = "business" | "personal" | "household";
type ClientKind =
  | "private_person"
  | "household"
  | "sole_proprietor"
  | "company";
type DeclarationType = "income_tax_private" | "income_tax_entrepreneur";

type ExistingDeclaration = {
  id?: string;
  declarationType: string;
  taxYear: number;
};

type ExistingServiceOrder = {
  productCode: string;
  taxYear: number | null;
  status: string;
  polarProductId?: string | null;
};

type ExistingEntitlement = {
  productCode: string;
  status: string;
};

const declarationLabels: Record<DeclarationType, string> = {
  income_tax_private: "Inkomstenbelasting particulier",
  income_tax_entrepreneur: "Inkomstenbelasting ondernemer",
};
const includedPlans = new Set(["starter", "pro"]);
const pendingOrderStatuses = new Set(["draft", "ordered"]);

function defaultTaxYear() {
  return new Date().getFullYear() - 1;
}

function declarationOptions(
  workspaceType?: WorkspaceType | null,
  clientKind?: ClientKind | null,
): DeclarationType[] {
  if (workspaceType === "business") {
    return ["income_tax_entrepreneur"];
  }

  if (clientKind === "sole_proprietor" || clientKind === "company") {
    return ["income_tax_entrepreneur"];
  }

  return ["income_tax_private"];
}

function findExistingDeclaration(
  declarations: ExistingDeclaration[],
  declarationType: DeclarationType,
  taxYear: number,
) {
  return declarations.some(
    (declaration) =>
      declaration.declarationType === declarationType &&
      declaration.taxYear === taxYear,
  );
}

function findExistingPendingOrder(
  serviceOrders: ExistingServiceOrder[],
  declarationType: DeclarationType,
  taxYear: number,
) {
  return serviceOrders.find(
    (serviceOrder) =>
      serviceOrder.productCode === declarationType &&
      serviceOrder.taxYear === taxYear &&
      pendingOrderStatuses.has(serviceOrder.status),
  );
}

function hasActiveEntitlement(
  entitlements: ExistingEntitlement[],
  declarationType: DeclarationType,
) {
  return entitlements.some(
    (entitlement) =>
      entitlement.productCode === declarationType &&
      entitlement.status === "active",
  );
}

export function TaxDeclarationOrderAction({
  workspaceType,
  clientKind,
  plan,
  declarations,
  serviceOrders = [],
  entitlements = [],
}: {
  workspaceType?: WorkspaceType | null;
  clientKind?: ClientKind | null;
  plan?: string | null;
  declarations: ExistingDeclaration[];
  serviceOrders?: ExistingServiceOrder[];
  entitlements?: ExistingEntitlement[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const options = useMemo(
    () => declarationOptions(workspaceType, clientKind),
    [workspaceType, clientKind],
  );
  const [open, setOpen] = useState(false);
  const [declarationType, setDeclarationType] = useState<DeclarationType>(
    options[0] ?? "income_tax_private",
  );
  const [taxYear, setTaxYear] = useState(defaultTaxYear());
  const [error, setError] = useState<string | null>(null);

  const existing = findExistingDeclaration(
    declarations,
    declarationType,
    taxYear,
  );
  const existingPendingOrder = findExistingPendingOrder(
    serviceOrders,
    declarationType,
    taxYear,
  );
  const includedInPlan = includedPlans.has(plan ?? "");
  const coveredByEntitlement = hasActiveEntitlement(
    entitlements,
    declarationType,
  );
  const hasCoverage = includedInPlan || coveredByEntitlement;

  useEffect(() => {
    if (!options.includes(declarationType)) {
      setDeclarationType(options[0] ?? "income_tax_private");
    }
  }, [declarationType, options]);

  const orderMutation = useMutation(
    trpc.tax.requestDeclaration.mutationOptions({
      onSuccess: (result) => {
        const normalizedResult = result as unknown as {
          status?: "existing" | "ready" | "payment_required" | null;
          declarationId?: string | null;
          serviceOrderId?: string | null;
          checkoutUrl?: string | null;
          created?: boolean;
          declaration?: { id?: string | null };
        };
        const resultStatus =
          normalizedResult.status ??
          (normalizedResult.declaration
            ? normalizedResult.created
              ? "ready"
              : "existing"
            : null);
        const declarationId =
          normalizedResult.declarationId ??
          normalizedResult.declaration?.id ??
          null;

        setError(null);
        queryClient.invalidateQueries({
          queryKey: trpc.tax.current.queryKey(),
        });

        if (resultStatus === "payment_required") {
          setOpen(false);
          toast({
            duration: 4500,
            title: normalizedResult.checkoutUrl
              ? "Bestelling klaar voor betaling."
              : "Bestelling geplaatst.",
            description: normalizedResult.checkoutUrl
              ? "Je wordt doorgestuurd naar de betaalpagina."
              : "We activeren het dossier zodra betaling of backoffice-activatie is gekoppeld.",
          });

          if (normalizedResult.checkoutUrl) {
            window.location.href = normalizedResult.checkoutUrl;
          }

          return;
        }

        if (!declarationId) {
          setError("Aangiftedossier kon niet worden geopend.");
          return;
        }

        setOpen(false);
        toast({
          duration: 3500,
          title:
            resultStatus === "existing"
              ? "Bestaand aangiftedossier geopend."
              : "Aangifte is inbegrepen en staat klaar.",
        });
        router.push(`/tax/${declarationId}`);
      },
      onError: (mutationError) => {
        setError(mutationError.message);
      },
    }),
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    orderMutation.mutate({
      declarationType,
      taxYear,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FilePlus2 className="mr-2 size-4" />
          Aangifte bestellen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader className="border-border border-b px-6 py-5">
            <DialogTitle>Aangifte bestellen</DialogTitle>
            <DialogDescription>
              {hasCoverage
                ? "Deze aangifte is gedekt. Na bestellen openen we meteen het dossier en de intake."
                : "We registreren je bestelling. Het dossier en de intake worden pas actief na betaling of backoffice-activatie."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 px-6 py-5">
            <label
              className="grid gap-2 text-sm"
              htmlFor="tax-declaration-type"
            >
              <span className="text-muted-foreground">Type aangifte</span>
              <Select
                value={declarationType}
                onValueChange={(value) =>
                  setDeclarationType(value as DeclarationType)
                }
              >
                <SelectTrigger id="tax-declaration-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {declarationLabels[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-2 text-sm" htmlFor="tax-year">
              <span className="text-muted-foreground">Belastingjaar</span>
              <Input
                id="tax-year"
                min={2000}
                max={2100}
                type="number"
                value={taxYear}
                onChange={(event) => setTaxYear(Number(event.target.value))}
              />
            </label>

            <div className="border border-border bg-muted/20 px-3 py-2 text-muted-foreground text-xs">
              {existing
                ? "Voor deze combinatie bestaat al een dossier. We openen dat dossier in plaats van een dubbele bestelling te maken."
                : existingPendingOrder
                  ? "Voor deze combinatie staat al een bestelling open. We hergebruiken die order en maken geen dubbel dossier."
                  : hasCoverage
                    ? includedInPlan
                      ? "Inbegrepen in je abonnement. We maken direct het aangiftedossier, de taken en de intake aan."
                      : "Deze dienst is al geactiveerd door de backoffice. We maken direct het aangiftedossier, de taken en de intake aan."
                    : "Betaling vereist. Zonder betaling of backoffice-activatie blijft dit een bestelling zonder actieve intake."}
            </div>

            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>

          <DialogFooter className="border-border border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={orderMutation.isPending}
              onClick={() => setOpen(false)}
            >
              Annuleren
            </Button>
            <Button disabled={orderMutation.isPending} type="submit">
              {orderMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Bestellen
                </>
              ) : existing ? (
                "Open dossier"
              ) : existingPendingOrder?.polarProductId ? (
                "Betaling afronden"
              ) : existingPendingOrder ? (
                "Open bestelling"
              ) : (
                "Bestelling plaatsen"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
