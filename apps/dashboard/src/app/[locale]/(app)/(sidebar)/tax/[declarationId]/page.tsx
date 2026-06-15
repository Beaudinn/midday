import type { Metadata } from "next";
import { TaxIntakeDetail } from "@/components/tax/tax-intake-detail";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

export const metadata: Metadata = {
  title: "Tax Intake | Midday",
};

type Props = {
  params: Promise<{ declarationId: string }>;
};

export default async function TaxDeclarationPage({ params }: Props) {
  const { declarationId } = await params;

  prefetch(trpc.tax.getDeclarationIntake.queryOptions({ declarationId }));

  return (
    <HydrateClient>
      <TaxIntakeDetail declarationId={declarationId} />
    </HydrateClient>
  );
}
