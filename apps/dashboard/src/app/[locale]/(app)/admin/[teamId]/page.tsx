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
import { AdminTaxClientActions } from "@/components/admin/tax-client-actions";
import { getQueryClient, trpc } from "@/trpc/server";

export const metadata: Metadata = {
  title: "Admin Client | Midday",
};

type PageProps = {
  params: Promise<{ teamId: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value));
}

function label(value?: string | null) {
  return value?.replaceAll("_", " ") ?? "-";
}

function statusTone(status?: string | null) {
  if (!status) {
    return "text-muted-foreground";
  }

  if (["active", "matched", "answered", "confirmed"].includes(status)) {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (
    ["needs_review", "activation_required", "requested", "open"].includes(
      status,
    )
  ) {
    return "text-amber-600 dark:text-amber-400";
  }

  return "text-muted-foreground";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export default async function AdminClientPage({ params }: PageProps) {
  const { teamId } = await params;
  const queryClient = getQueryClient();

  const admin = await queryClient
    .fetchQuery(trpc.admin.me.queryOptions())
    .catch(() => redirect("/login"));

  if (!admin.enabled || !admin.staff) {
    redirect("/admin");
  }

  const client = await queryClient.fetchQuery(
    trpc.admin.client.queryOptions({ teamId }),
  );

  if (!client) {
    notFound();
  }

  const taxClient = client.taxClient;
  const activeProductCodes =
    taxClient?.entitlements
      .filter((entitlement) => entitlement.status === "active")
      .map((entitlement) => entitlement.productCode) ?? [];
  const openTasks =
    taxClient?.tasks.filter((task) => task.status === "open") ?? [];
  const activationMatches =
    taxClient?.documentMatches.filter((match) => match.status === "matched") ??
    [];

  return (
    <main className="min-h-screen px-6 py-6 md:px-10">
      <div className="mb-8 flex items-center justify-between border-b border-border pb-5">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline">admin</Badge>
            <Badge variant="outline">{admin.staff.role}</Badge>
          </div>
          <h1 className="font-serif text-2xl">
            {client.name || "Untitled team"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.email || client.id}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/admin">Clients</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Dashboard</Link>
          </Button>
        </div>
      </div>

      <section className="mb-8 grid gap-3 md:grid-cols-4">
        <Stat label="Workspace" value={label(client.workspaceType)} />
        <Stat label="Plan" value={client.plan ?? "-"} />
        <Stat label="Members" value={client.memberCount} />
        <Stat label="Created" value={formatDate(client.createdAt)} />
      </section>

      <section className="mb-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="border border-border">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">Tax client</h2>
            </div>
            <div className="space-y-3 p-4">
              {taxClient ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Kind</span>
                    <Badge variant="outline">
                      {label(taxClient.clientKind)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      Status
                    </span>
                    <span className={`text-sm ${statusTone(taxClient.status)}`}>
                      {label(taxClient.status)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      Onboarding
                    </span>
                    <span className="text-sm">
                      {label(taxClient.onboardingStatus)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This team is not active as a tax client yet.
                </p>
              )}

              <div className="pt-2">
                <AdminTaxClientActions
                  teamId={client.id}
                  workspaceType={client.workspaceType}
                  hasTaxClient={Boolean(taxClient)}
                  activeProductCodes={activeProductCodes}
                />
              </div>
            </div>
          </div>

          <div className="border border-border">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">Subjects</h2>
            </div>
            <div className="divide-y divide-border">
              {taxClient?.subjects.length ? (
                taxClient.subjects.map((subject) => (
                  <div key={subject.id} className="space-y-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">
                        {subject.displayName}
                      </span>
                      <Badge variant="outline">{label(subject.role)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {label(subject.subjectType)} · {subject.countryCode} ·{" "}
                      {label(subject.accessStatus)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4">
                  <EmptyState>No tax subjects yet.</EmptyState>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Services"
              value={taxClient?.entitlements.length ?? 0}
            />
            <Stat label="Mandates" value={taxClient?.mandates.length ?? 0} />
            <Stat label="Open tasks" value={openTasks.length} />
            <Stat label="Matched letters" value={activationMatches.length} />
          </div>

          <div className="border border-border">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">Services</h2>
            </div>
            {taxClient?.entitlements.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxClient.entitlements.map((entitlement) => (
                    <TableRow key={entitlement.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {entitlement.productName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entitlement.productCode}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-sm ${statusTone(entitlement.status)}`}
                        >
                          {label(entitlement.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {label(entitlement.source)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4">
                <EmptyState>No active tax services.</EmptyState>
              </div>
            )}
          </div>

          <div className="border border-border">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">Mandates</h2>
            </div>
            {taxClient?.mandates.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tax year</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Activated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxClient.mandates.map((mandate) => (
                    <TableRow key={mandate.id}>
                      <TableCell>
                        <Badge variant="outline">{mandate.mandateType}</Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-sm ${statusTone(mandate.status)}`}
                        >
                          {label(mandate.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {mandate.taxYear ?? "Current"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(mandate.requestedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(mandate.activatedAt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4">
                <EmptyState>No mandates requested.</EmptyState>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mb-8 border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Tasks</h2>
          <span className="text-xs text-muted-foreground">
            {taxClient?.tasks.length ?? 0} total
          </span>
        </div>
        {taxClient?.tasks.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxClient.tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{task.title}</span>
                      {task.description && (
                        <span className="max-w-2xl text-xs text-muted-foreground">
                          {task.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm ${statusTone(task.status)}`}>
                      {label(task.status)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(task.dueDate)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(task.createdAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-4">
            <EmptyState>No tax tasks yet.</EmptyState>
          </div>
        )}
      </section>

      <section className="border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Mandate document matches</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              OCR results from generic Vault uploads, linked back to the source
              document record.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {taxClient?.documentMatches.length ?? 0} total
          </span>
        </div>

        {taxClient?.documentMatches.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Document date</TableHead>
                <TableHead>Matched</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxClient.documentMatches.map((match) => (
                <TableRow key={match.id}>
                  <TableCell>
                    <div className="flex max-w-md flex-col">
                      <span className="truncate text-sm font-medium">
                        {match.documentTitle ||
                          match.filePathTokens.at(-1) ||
                          "Document"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {match.filePathTokens.join("/")}
                      </span>
                      {match.documentId && (
                        <span className="text-[10px] text-muted-foreground">
                          document:{match.documentId}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className={`text-sm ${statusTone(match.status)}`}>
                        {label(match.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {match.extractedMandateType ?? "-"} ·{" "}
                        {match.extractedTaxYear ?? "current/no year"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">
                      {match.extractedCodePreview ?? "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {match.extractionConfidence !== null
                        ? `${match.extractionConfidence}%`
                        : "-"}
                    </span>
                    {match.extractionReason && (
                      <div className="mt-1 max-w-xs text-xs text-muted-foreground">
                        {match.extractionReason}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(match.documentDate)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(match.matchedAt ?? match.createdAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-4">
            <EmptyState>No uploaded mandate letters matched yet.</EmptyState>
          </div>
        )}
      </section>
    </main>
  );
}
