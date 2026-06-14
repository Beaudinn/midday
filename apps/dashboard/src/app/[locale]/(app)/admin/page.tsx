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
import { redirect } from "next/navigation";
import { AdminTaxClientActions } from "@/components/admin/tax-client-actions";
import { getQueryClient, trpc } from "@/trpc/server";

export const metadata: Metadata = {
  title: "Admin | Midday",
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function mandateStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function AdminPage() {
  const queryClient = getQueryClient();

  const admin = await queryClient
    .fetchQuery(trpc.admin.me.queryOptions())
    .catch(() => redirect("/login"));

  if (!admin.enabled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
        <div className="space-y-4">
          <Badge variant="outline">Admin disabled</Badge>
          <h1 className="font-serif text-2xl">Tax admin is not enabled</h1>
          <p className="text-sm text-muted-foreground">
            Set MIDDAY_TAX_ADMIN_ENABLED=true before exposing platform admin
            tooling outside development.
          </p>
          <Button asChild variant="outline">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!admin.staff) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
        <div className="space-y-4">
          <Badge variant="outline">No staff access</Badge>
          <h1 className="font-serif text-2xl">Admin access required</h1>
          <p className="text-sm text-muted-foreground">
            Your user must exist in platform_staff before you can view client
            teams or backoffice workflows.
          </p>
          <Button asChild variant="outline">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    );
  }

  const clients = await queryClient.fetchQuery(
    trpc.admin.clients.queryOptions({ limit: 50 }),
  );

  return (
    <main className="min-h-screen px-6 py-6 md:px-10">
      <div className="mb-8 flex items-center justify-between border-b border-border pb-5">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline">{admin.staff.role}</Badge>
            <Badge variant="outline">tax_admin</Badge>
          </div>
          <h1 className="font-serif text-2xl">Admin</h1>
        </div>

        <Button asChild variant="outline">
          <Link href="/">Dashboard</Link>
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Client teams</h2>
          <span className="text-xs text-muted-foreground">
            {clients.length} shown
          </span>
        </div>

        <div className="overflow-hidden border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Services</TableHead>
                <TableHead>Mandates</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        <Link
                          href={`/admin/${client.id}`}
                          className="hover:underline"
                        >
                          {client.name || "Untitled team"}
                        </Link>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {client.email || client.id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{client.workspaceType}</Badge>
                  </TableCell>
                  <TableCell>
                    {client.taxClient ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline">{client.taxClient.kind}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {client.taxClient.status}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Not active
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.taxClient?.activeProductNames.length ? (
                      <div className="flex flex-wrap gap-1">
                        {client.taxClient.activeProductNames.map((name) => (
                          <Badge key={name} variant="outline">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No services
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.taxClient ? (
                      client.taxClient.mandates.total ? (
                        <div className="flex max-w-52 flex-wrap gap-1">
                          <Badge variant="outline">
                            {client.taxClient.mandates.total} total
                          </Badge>
                          {client.taxClient.mandates.openTasks > 0 && (
                            <Badge variant="outline">
                              {client.taxClient.mandates.openTasks} open
                            </Badge>
                          )}
                          {client.taxClient.mandates.mandateTypes.map(
                            (mandateType) => (
                              <Badge key={mandateType} variant="outline">
                                {mandateType}
                              </Badge>
                            ),
                          )}
                          {client.taxClient.mandates.statuses.map((status) => (
                            <span
                              key={status}
                              className="text-xs text-muted-foreground"
                            >
                              {mandateStatusLabel(status)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No mandates
                        </span>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Not active
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{client.plan}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{client.memberCount}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {dateFormatter.format(new Date(client.createdAt))}
                    </span>
                  </TableCell>
                  <TableCell>
                    <AdminTaxClientActions
                      teamId={client.id}
                      workspaceType={client.workspaceType}
                      hasTaxClient={Boolean(client.taxClient)}
                      activeProductCodes={
                        client.taxClient?.activeProductCodes ?? []
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}
