import type { Metadata } from "next";
import { TaxOverview } from "@/components/tax/tax-overview";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

export const metadata: Metadata = {
  title: "Tax Returns | Midday",
};

export default function TaxPage() {
  prefetch(trpc.team.current.queryOptions());
  prefetch(trpc.tax.current.queryOptions());

  return (
    <HydrateClient>
      <TaxOverview />
    </HydrateClient>
  );
}
