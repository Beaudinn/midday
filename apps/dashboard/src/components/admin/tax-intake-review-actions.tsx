"use client";

import { Button } from "@midday/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/client";

export function AdminTaxIntakeAcceptAction({
  teamId,
  intakeId,
}: {
  teamId: string;
  intakeId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const mutation = useMutation(
    trpc.admin.acceptIntake.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <Button
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ teamId, intakeId })}
    >
      {mutation.isPending ? "Accepting" : "Accept intake"}
    </Button>
  );
}

export function AdminTaxIntakeAnswerActions({
  teamId,
  answerId,
  status,
}: {
  teamId: string;
  answerId: string;
  status: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const mutation = useMutation(
    trpc.admin.reviewIntakeAnswer.mutationOptions({
      onSettled: () => setPendingStatus(null),
      onSuccess: () => router.refresh(),
    }),
  );

  const actions = [
    ["confirmed", "Confirm"],
    ["needs_review", "Needs review"],
    ["rejected", "Reject"],
  ] as const;

  return (
    <div className="flex flex-wrap gap-1.5">
      {actions
        .filter(([nextStatus]) => nextStatus !== status)
        .map(([nextStatus, label]) => (
          <Button
            key={nextStatus}
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              setPendingStatus(nextStatus);
              mutation.mutate({
                teamId,
                answerId,
                status: nextStatus,
              });
            }}
          >
            {pendingStatus === nextStatus ? "..." : label}
          </Button>
        ))}
    </div>
  );
}

export function AdminTaxIntakeRequestInfoAction({
  teamId,
  intakeId,
  questionKey,
  label,
}: {
  teamId: string;
  intakeId: string;
  questionKey: string;
  label: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const mutation = useMutation(
    trpc.admin.requestTaxIntakeInfo.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={mutation.isPending}
      onClick={() =>
        mutation.mutate({
          teamId,
          intakeId,
          questionKey,
          title: `Provide: ${label}`,
          description: `Please provide or correct this intake answer: ${label}`,
        })
      }
    >
      {mutation.isPending ? "Requesting" : "Request info"}
    </Button>
  );
}
