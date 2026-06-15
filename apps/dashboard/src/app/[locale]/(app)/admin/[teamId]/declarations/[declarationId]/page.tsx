import { Badge } from "@midday/ui/badge";
import { Button } from "@midday/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@midday/ui/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AdminTaxIntakeAcceptAction,
  AdminTaxIntakeAnswerActions,
  AdminTaxIntakeRequestInfoAction,
} from "@/components/admin/tax-intake-review-actions";
import { getQueryClient, trpc } from "@/trpc/server";

export const metadata: Metadata = {
  title: "Admin Tax Intake | Midday",
};

type PageProps = {
  params: Promise<{ teamId: string; declarationId: string }>;
};

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

function formatValue(value: unknown) {
  const raw = primitive(value);

  if (raw === null || raw === undefined || raw === "") {
    return "-";
  }

  if (typeof raw === "boolean") {
    return raw ? "Yes" : "No";
  }

  return String(raw);
}

function statusTone(status?: string | null) {
  if (!status) {
    return "text-muted-foreground";
  }

  if (["confirmed", "accepted", "submitted", "resolved"].includes(status)) {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (["suggested", "needs_info", "needs_review", "open"].includes(status)) {
    return "text-amber-600 dark:text-amber-400";
  }

  if (["rejected", "failed"].includes(status)) {
    return "text-destructive";
  }

  return "text-muted-foreground";
}

function bestAnswer<T extends { questionKey: string; status: string }>(
  answers: T[],
  questionKey: string,
) {
  const candidates = answers.filter(
    (answer) =>
      answer.questionKey === questionKey && answer.status !== "rejected",
  );

  return (
    candidates.find((answer) => answer.status === "confirmed") ??
    candidates.find((answer) => answer.status === "needs_review") ??
    candidates.find((answer) => answer.status === "suggested") ??
    candidates.at(0)
  );
}

export default async function AdminTaxIntakePage({ params }: PageProps) {
  const { teamId, declarationId } = await params;
  const queryClient = getQueryClient();

  const admin = await queryClient
    .fetchQuery(trpc.admin.me.queryOptions())
    .catch(() => redirect("/login"));

  if (!admin.enabled || !admin.staff) {
    redirect("/admin");
  }

  const detail = await queryClient.fetchQuery(
    trpc.admin.getTaxDeclarationIntake.queryOptions({ teamId, declarationId }),
  );

  if (!detail) {
    notFound();
  }

  return (
    <main className="min-h-screen px-6 py-6 md:px-10">
      <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-5 md:flex-row md:items-start">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">admin</Badge>
            <Badge variant="outline">{label(detail.declaration.status)}</Badge>
            <Badge variant="outline">
              Intake {label(detail.intake.status)}
            </Badge>
          </div>
          <h1 className="font-serif text-2xl">
            {label(detail.declaration.declarationType)}{" "}
            {detail.declaration.taxYear}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {detail.progress.completedRequired}/{detail.progress.totalRequired}{" "}
            required confirmed · {detail.progress.suggestedAnswers} suggestions
            · {detail.progress.missingRequired} missing
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/${teamId}`}>Client</Link>
          </Button>
          <AdminTaxIntakeAcceptAction
            teamId={teamId}
            intakeId={detail.intake.id}
          />
        </div>
      </div>

      <section className="mb-8 grid gap-3 md:grid-cols-4">
        <div className="border border-border px-3 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">
            Template
          </div>
          <div className="mt-1 text-sm font-medium">
            {detail.intake.templateKey} v{detail.intake.templateVersion}
          </div>
        </div>
        <div className="border border-border px-3 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">
            Deadline
          </div>
          <div className="mt-1 text-sm font-medium">
            {detail.declaration.deadlineDate ?? "-"}
          </div>
        </div>
        <div className="border border-border px-3 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">
            Documents
          </div>
          <div className="mt-1 text-sm font-medium">
            {detail.documents.length}
          </div>
        </div>
        <div className="border border-border px-3 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">
            Tasks
          </div>
          <div className="mt-1 text-sm font-medium">{detail.tasks.length}</div>
        </div>
      </section>

      <div className="space-y-6">
        {detail.template.sections.map((section) => (
          <section key={section.key} className="border border-border">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">{section.title}</h2>
              <p className="mt-1 text-muted-foreground text-xs">
                {section.description}
              </p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Answer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.questions.map((question) => {
                  const answer = bestAnswer(detail.answers, question.key);
                  const isMissing = detail.progress.missingQuestions.some(
                    (item) => item.questionKey === question.key,
                  );

                  return (
                    <TableRow key={question.key}>
                      <TableCell>
                        <div className="max-w-md">
                          <div className="text-sm">{question.label}</div>
                          <div className="mt-1 flex gap-1.5">
                            <Badge variant="outline">{question.scope}</Badge>
                            {isMissing && (
                              <Badge variant="outline">missing</Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {answer ? formatValue(answer.value) : "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-sm ${statusTone(answer?.status)}`}
                        >
                          {label(answer?.status)}
                        </span>
                        {answer?.confidence !== null &&
                          answer?.confidence !== undefined && (
                            <div className="text-muted-foreground text-xs">
                              {answer.confidence}%
                            </div>
                          )}
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm">
                          {label(answer?.source)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="max-w-xs truncate text-muted-foreground text-sm">
                          {answer?.documentTitle ??
                            answer?.documentPathTokens?.at(-1) ??
                            "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {answer ? (
                          <AdminTaxIntakeAnswerActions
                            teamId={teamId}
                            answerId={answer.id}
                            status={answer.status}
                          />
                        ) : (
                          <AdminTaxIntakeRequestInfoAction
                            teamId={teamId}
                            intakeId={detail.intake.id}
                            questionKey={question.key}
                            label={question.label}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        ))}
      </div>

      <section className="mt-8 border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Linked documents</h2>
        </div>
        {detail.documents.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {document.documentTitle ??
                          document.documentPathTokens?.at(-1) ??
                          "Document"}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {document.documentPathTokens?.join("/") ?? "-"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{document.sectionKey}</TableCell>
                  <TableCell>{label(document.documentType)}</TableCell>
                  <TableCell>
                    <span className={`text-sm ${statusTone(document.status)}`}>
                      {label(document.status)}
                    </span>
                  </TableCell>
                  <TableCell>{document.confidence ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-6 text-muted-foreground text-sm">
            No intake documents linked yet.
          </div>
        )}
      </section>
    </main>
  );
}
