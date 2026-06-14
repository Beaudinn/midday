"use client";

import { Button } from "@midday/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/client";

type MandateStatus =
  | "draft"
  | "requested"
  | "letter_sent"
  | "activation_required"
  | "active"
  | "rejected"
  | "expired"
  | "revoked";

export function AdminTaxMandateDigipoortActions({
  teamId,
  mandateId,
  status,
}: {
  teamId: string;
  mandateId: string;
  status: MandateStatus;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const requestMutation = useMutation(
    trpc.admin.requestTaxMandateViaDigipoort.mutationOptions({
      onSuccess: () => {
        setError(null);
        router.refresh();
      },
      onError: (mutationError) => {
        setError(mutationError.message);
      },
    }),
  );

  if (status === "active") {
    return <span className="text-xs text-muted-foreground">Active</span>;
  }

  if (status === "letter_sent") {
    return (
      <span className="text-xs text-muted-foreground">Letter requested</span>
    );
  }

  if (status === "activation_required") {
    return <span className="text-xs text-muted-foreground">Code received</span>;
  }

  if (["rejected", "expired", "revoked"].includes(status)) {
    return <span className="text-xs text-muted-foreground">Closed</span>;
  }

  const requestLetter = () => {
    const confirmed = window.confirm(
      "Queue a Digipoort/SBR mandate request for this authorization letter?",
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    requestMutation.mutate({ teamId, mandateId });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={requestMutation.isPending}
        onClick={requestLetter}
      >
        {requestMutation.isPending ? "Requesting" : "Request letter"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
