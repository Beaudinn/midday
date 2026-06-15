"use client";

import type { RouterOutputs } from "@api/trpc/routers/_app";
import { Badge } from "@midday/ui/badge";
import { Button } from "@midday/ui/button";
import { Input } from "@midday/ui/input";
import { Progress } from "@midday/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@midday/ui/select";
import { Textarea } from "@midday/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { VaultUploadZone } from "@/components/vault/vault-upload-zone";
import { useTRPC } from "@/trpc/client";

type IntakeDetail = NonNullable<RouterOutputs["tax"]["getDeclarationIntake"]>;
type IntakeAnswer = IntakeDetail["answers"][number];
type IntakeQuestion =
  IntakeDetail["template"]["sections"][number]["questions"][number];

function label(value?: string | null) {
  return value?.replaceAll("_", " ") ?? "-";
}

function primitive(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "value" in value
  ) {
    return (value as { value: unknown }).value;
  }

  return value;
}

function valueToInput(question: IntakeQuestion, answer?: IntakeAnswer) {
  const value = primitive(answer?.value);

  if (value === null || value === undefined) {
    return "";
  }

  if (question.type === "boolean") {
    return value === true ? "true" : value === false ? "false" : "";
  }

  return String(value);
}

function inputToValue(question: IntakeQuestion, value: string) {
  if (question.type === "boolean") {
    return value === "true";
  }

  if (question.type === "number") {
    return value.trim() ? Number(value) : null;
  }

  return value.trim() ? value.trim() : null;
}

function progressValue(progress: IntakeDetail["progress"]) {
  if (!progress.totalRequired) {
    return 0;
  }

  return Math.round(
    (progress.completedRequired / progress.totalRequired) * 100,
  );
}

function statusTone(status: string) {
  if (["confirmed", "accepted", "submitted"].includes(status)) {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (["suggested", "needs_info", "needs_review"].includes(status)) {
    return "text-amber-600 dark:text-amber-400";
  }

  if (status === "rejected") {
    return "text-destructive";
  }

  return "text-muted-foreground";
}

function bestAnswerForQuestion(
  answers: IntakeAnswer[],
  question: IntakeQuestion,
) {
  const candidates = answers.filter(
    (answer) =>
      answer.questionKey === question.key &&
      answer.subjectScope === question.scope &&
      answer.status !== "rejected" &&
      answer.status !== "suggested",
  );

  return (
    candidates.find((answer) => answer.status === "confirmed") ??
    candidates.at(0)
  );
}

function AnswerField({
  detail,
  sectionKey,
  question,
  answer,
}: {
  detail: IntakeDetail;
  sectionKey: string;
  question: IntakeQuestion;
  answer?: IntakeAnswer;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(valueToInput(question, answer));
  const queryKey = trpc.tax.getDeclarationIntake.queryKey({
    declarationId: detail.declaration.id,
  });

  useEffect(() => {
    setValue(valueToInput(question, answer));
  }, [answer?.id, answer?.updatedAt, question, answer]);

  const mutation = useMutation(
    trpc.tax.upsertIntakeAnswer.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({
          queryKey: trpc.tax.current.queryKey(),
        });
      },
    }),
  );
  const source = question.scope === "partner" ? "partner" : "client";

  const save = () => {
    mutation.mutate({
      intakeId: detail.intake.id,
      sectionKey,
      questionKey: question.key,
      subjectScope: question.scope,
      value: inputToValue(question, value),
      source,
    });
  };

  return (
    <div className="grid gap-3 border-b border-border py-4 last:border-b-0 md:grid-cols-[minmax(220px,0.9fr)_minmax(240px,1fr)_auto] md:items-start">
      <div>
        <div className="text-sm">{question.label}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="outline">{question.scope}</Badge>
          {answer && (
            <span className={`text-xs ${statusTone(answer.status)}`}>
              {label(answer.status)}
            </span>
          )}
        </div>
      </div>

      {question.type === "boolean" ? (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      ) : question.type === "select" ? (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {question.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : question.type === "text" ? (
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={3}
        />
      ) : (
        <Input
          value={value}
          type={question.type === "number" ? "number" : question.type}
          onChange={(event) => setValue(event.target.value)}
        />
      )}

      <Button
        type="button"
        variant="outline"
        disabled={mutation.isPending}
        onClick={save}
      >
        {mutation.isPending ? "Saving" : "Save"}
      </Button>
    </div>
  );
}

function Suggestions({
  detail,
  sectionKey,
}: {
  detail: IntakeDetail;
  sectionKey: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.tax.getDeclarationIntake.queryKey({
    declarationId: detail.declaration.id,
  });
  const suggestions = detail.answers.filter(
    (answer) =>
      answer.sectionKey === sectionKey && answer.status === "suggested",
  );
  const confirmMutation = useMutation(
    trpc.tax.confirmIntakeSuggestion.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({
          queryKey: trpc.tax.current.queryKey(),
        });
      },
    }),
  );
  const rejectMutation = useMutation(
    trpc.tax.rejectIntakeSuggestion.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({
          queryKey: trpc.tax.current.queryKey(),
        });
      },
    }),
  );

  if (!suggestions.length) {
    return null;
  }

  return (
    <div className="mt-4 border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-medium text-sm">Document suggestions</h3>
        <Badge variant="outline">{suggestions.length}</Badge>
      </div>
      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="grid gap-3 border-border border-t pt-3 md:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="text-sm">
                {label(suggestion.questionKey)}:{" "}
                <span className="font-medium">
                  {String(primitive(suggestion.value))}
                </span>
              </div>
              <div className="mt-1 text-muted-foreground text-xs">
                {suggestion.documentTitle ??
                  suggestion.documentPathTokens?.at(-1) ??
                  "Document"}
                {suggestion.confidence !== null
                  ? ` · ${suggestion.confidence}%`
                  : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={confirmMutation.isPending || rejectMutation.isPending}
                onClick={() =>
                  confirmMutation.mutate({ answerId: suggestion.id })
                }
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={confirmMutation.isPending || rejectMutation.isPending}
                onClick={() =>
                  rejectMutation.mutate({ answerId: suggestion.id })
                }
              >
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TaxIntakeDetail({ declarationId }: { declarationId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = trpc.tax.getDeclarationIntake.queryKey({ declarationId });
  const { data: detail } = useSuspenseQuery(
    trpc.tax.getDeclarationIntake.queryOptions({ declarationId }),
  );
  const submitMutation = useMutation(
    trpc.tax.submitIntake.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({
          queryKey: trpc.tax.current.queryKey(),
        });
        router.refresh();
      },
    }),
  );

  const missingByQuestion = useMemo(
    () =>
      new Set(
        detail?.progress.missingQuestions.map((item) => item.questionKey) ?? [],
      ),
    [detail?.progress.missingQuestions],
  );

  if (!detail) {
    return (
      <div className="mt-8 border border-dashed border-border p-10 text-center">
        <h1 className="font-serif text-2xl">Intake not found</h1>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/tax">Back to aangiftes</Link>
        </Button>
      </div>
    );
  }

  const progress = progressValue(detail.progress);

  return (
    <VaultUploadZone
      onUpload={() => {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey });
        }, 2500);
      }}
    >
      <div className="py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 border-b border-border pb-5 md:flex-row md:items-start">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant="outline">
                {label(detail.declaration.status)}
              </Badge>
              <Badge variant="outline">
                Intake {label(detail.intake.status)}
              </Badge>
            </div>
            <h1 className="font-serif text-3xl">
              Income tax {detail.declaration.taxYear}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              Deadline {detail.declaration.deadlineDate ?? "not set"} ·{" "}
              {detail.progress.suggestedAnswers} suggestions ·{" "}
              {detail.progress.missingRequired} missing required
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/vault">Upload in Vault</Link>
            </Button>
            <Button
              disabled={
                submitMutation.isPending || detail.progress.missingRequired > 0
              }
              onClick={() =>
                submitMutation.mutate({ intakeId: detail.intake.id })
              }
            >
              {submitMutation.isPending ? "Submitting" : "Submit intake"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="h-fit border border-border p-4 xl:sticky xl:top-20">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span>
                {detail.progress.completedRequired}/
                {detail.progress.totalRequired}
              </span>
            </div>
            <Progress value={progress} className="h-1.5" />
            <div className="mt-5 space-y-2">
              {detail.template.sections.map((section) => {
                const sectionMissing = detail.progress.missingQuestions.filter(
                  (item) => item.sectionKey === section.key,
                ).length;
                const sectionSuggestions = detail.answers.filter(
                  (answer) =>
                    answer.sectionKey === section.key &&
                    answer.status === "suggested",
                ).length;

                return (
                  <a
                    key={section.key}
                    href={`#${section.key}`}
                    className="flex items-center justify-between border border-border px-3 py-2 text-sm hover:bg-muted/30"
                  >
                    <span>{section.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {sectionMissing
                        ? `${sectionMissing} missing`
                        : sectionSuggestions
                          ? `${sectionSuggestions} suggested`
                          : "ok"}
                    </span>
                  </a>
                );
              })}
            </div>
          </aside>

          <div className="space-y-6">
            {detail.template.sections.map((section) => {
              const sectionDocuments = detail.documents.filter(
                (document) => document.sectionKey === section.key,
              );

              return (
                <section
                  id={section.key}
                  key={section.key}
                  className="border border-border"
                >
                  <div className="border-b border-border px-5 py-4">
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div>
                        <h2 className="font-medium text-lg">{section.title}</h2>
                        <p className="mt-1 text-muted-foreground text-sm">
                          {section.description}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {sectionDocuments.length} documents
                      </Badge>
                    </div>
                  </div>

                  <div className="px-5">
                    {section.questions.map((question) => (
                      <div key={question.key} className="relative">
                        {missingByQuestion.has(question.key) && (
                          <div className="absolute top-4 -left-5 h-6 w-1 bg-amber-500" />
                        )}
                        <AnswerField
                          detail={detail}
                          sectionKey={section.key}
                          question={question}
                          answer={bestAnswerForQuestion(
                            detail.answers,
                            question,
                          )}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border px-5 py-4">
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                      <div className="text-muted-foreground text-sm">
                        Drop files anywhere on this page or upload through
                        Vault. Matched documents appear here as suggestions.
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/vault">Vault</Link>
                      </Button>
                    </div>
                    {sectionDocuments.length > 0 && (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {sectionDocuments.map((document) => (
                          <div
                            key={document.id}
                            className="border border-border px-3 py-2 text-sm"
                          >
                            <div className="truncate">
                              {document.documentTitle ??
                                document.documentPathTokens?.at(-1) ??
                                "Document"}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {label(document.documentType)} ·{" "}
                              {label(document.status)}
                              {document.confidence !== null
                                ? ` · ${document.confidence}%`
                                : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <Suggestions detail={detail} sectionKey={section.key} />
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </VaultUploadZone>
  );
}
