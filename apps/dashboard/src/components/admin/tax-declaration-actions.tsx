"use client";

import { Button } from "@midday/ui/button";
import { Input } from "@midday/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@midday/ui/select";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useTRPC } from "@/trpc/client";

type WorkspaceType = "business" | "personal" | "household";
type DeclarationType =
  | "income_tax_private"
  | "income_tax_entrepreneur"
  | "vat_return";
type DeclarationStatus =
  | "draft"
  | "collecting"
  | "ready_for_review"
  | "in_review"
  | "approved"
  | "queued_for_submission"
  | "submitted"
  | "accepted"
  | "rejected"
  | "cancelled";

function defaultDeclarationType(workspaceType: WorkspaceType): DeclarationType {
  return workspaceType === "business"
    ? "income_tax_entrepreneur"
    : "income_tax_private";
}

function normalizeOptional(value: string) {
  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function nextStatusActions(status: DeclarationStatus) {
  switch (status) {
    case "draft":
      return [
        ["collecting", "Collect"],
        ["ready_for_review", "Ready"],
        ["approved", "Approve"],
      ] as const;
    case "collecting":
      return [
        ["ready_for_review", "Ready"],
        ["approved", "Approve"],
      ] as const;
    case "ready_for_review":
      return [
        ["in_review", "Review"],
        ["approved", "Approve"],
      ] as const;
    case "in_review":
      return [["approved", "Approve"]] as const;
    case "approved":
      return [["queued_for_submission", "Queue submit"]] as const;
    case "queued_for_submission":
      return [["submitted", "Submitted"]] as const;
    case "submitted":
      return [
        ["accepted", "Accepted"],
        ["rejected", "Rejected"],
      ] as const;
    default:
      return [] as const;
  }
}

export function AdminTaxDeclarationCreateAction({
  teamId,
  workspaceType,
}: {
  teamId: string;
  workspaceType: WorkspaceType;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [declarationType, setDeclarationType] = useState<DeclarationType>(
    defaultDeclarationType(workspaceType),
  );
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation(
    trpc.admin.createTaxDeclaration.mutationOptions({
      onSuccess: () => {
        setError(null);
        router.refresh();
      },
      onError: (mutationError) => {
        setError(mutationError.message);
      },
    }),
  );

  const createDeclaration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    createMutation.mutate({
      teamId,
      declarationType,
      taxYear: Number(formValue(formData, "taxYear")),
      period: normalizeOptional(formValue(formData, "period")),
      periodStart: normalizeOptional(formValue(formData, "periodStart")),
      periodEnd: normalizeOptional(formValue(formData, "periodEnd")),
      deadlineDate: normalizeOptional(formValue(formData, "deadlineDate")),
    });
  };

  return (
    <form
      className="grid gap-2 border-b border-border p-4 md:grid-cols-[minmax(190px,1fr)_110px_minmax(110px,0.7fr)_130px_130px_130px_auto]"
      onSubmit={createDeclaration}
    >
      <Select
        value={declarationType}
        onValueChange={(value) => setDeclarationType(value as DeclarationType)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="income_tax_private">IB private</SelectItem>
          <SelectItem value="income_tax_entrepreneur">
            IB entrepreneur
          </SelectItem>
          <SelectItem value="vat_return">VAT return</SelectItem>
        </SelectContent>
      </Select>

      <Input
        aria-label="Tax year"
        min={2000}
        max={2100}
        name="taxYear"
        type="number"
        value={taxYear}
        onChange={(event) => setTaxYear(Number(event.target.value))}
      />

      <Input
        aria-label="Period"
        name="period"
        placeholder="2026-Q1"
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
      />

      <Input
        aria-label="Period start"
        name="periodStart"
        required={declarationType === "vat_return"}
        type="date"
        value={periodStart}
        onChange={(event) => setPeriodStart(event.target.value)}
      />

      <Input
        aria-label="Period end"
        name="periodEnd"
        required={declarationType === "vat_return"}
        type="date"
        value={periodEnd}
        onChange={(event) => setPeriodEnd(event.target.value)}
      />

      <Input
        aria-label="Deadline"
        name="deadlineDate"
        type="date"
        value={deadlineDate}
        onChange={(event) => setDeadlineDate(event.target.value)}
      />

      <Button size="sm" variant="outline" disabled={createMutation.isPending}>
        {createMutation.isPending ? "Creating" : "Create"}
      </Button>

      {error && (
        <div className="text-destructive text-xs md:col-span-7">{error}</div>
      )}
    </form>
  );
}

export function AdminTaxDeclarationStatusActions({
  teamId,
  declarationId,
  status,
}: {
  teamId: string;
  declarationId: string;
  status: DeclarationStatus;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<DeclarationStatus | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const statusMutation = useMutation(
    trpc.admin.updateTaxDeclarationStatus.mutationOptions({
      onSettled: () => {
        setPendingStatus(null);
      },
      onSuccess: () => {
        setError(null);
        router.refresh();
      },
      onError: (mutationError) => {
        setError(mutationError.message);
      },
    }),
  );
  const actions = nextStatusActions(status);

  if (!actions.length) {
    return <span className="text-muted-foreground text-xs">Closed</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1.5">
        {actions.map(([nextStatus, label]) => (
          <Button
            key={nextStatus}
            size="sm"
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() => {
              setError(null);
              setPendingStatus(nextStatus);
              statusMutation.mutate({
                teamId,
                declarationId,
                status: nextStatus,
              });
            }}
          >
            {pendingStatus === nextStatus ? "..." : label}
          </Button>
        ))}
      </div>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}
