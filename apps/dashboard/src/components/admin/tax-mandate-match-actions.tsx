"use client";

import { Button } from "@midday/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/client";

type MatchStatus =
  | "pending"
  | "matched"
  | "needs_review"
  | "failed"
  | "confirmed"
  | "ignored";

export function AdminTaxMandateMatchActions({
  teamId,
  matchId,
  status,
}: {
  teamId: string;
  matchId: string;
  status: MatchStatus;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const confirmMutation = useMutation(
    trpc.admin.confirmTaxMandateDocumentMatch.mutationOptions({
      onSuccess: () => {
        setError(null);
        router.refresh();
      },
      onError: (mutationError) => {
        setError(mutationError.message);
      },
    }),
  );

  if (status === "confirmed") {
    return <span className="text-xs text-muted-foreground">Confirmed</span>;
  }

  if (!["matched", "needs_review"].includes(status)) {
    return <span className="text-xs text-muted-foreground">Not ready</span>;
  }

  const confirmActivation = () => {
    const confirmed = window.confirm(
      "Confirm this mandate as active after Digipoort/SBR activation or manual verification?",
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    confirmMutation.mutate({ teamId, matchId });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={confirmMutation.isPending}
        onClick={confirmActivation}
      >
        {confirmMutation.isPending ? "Confirming" : "Confirm active"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
