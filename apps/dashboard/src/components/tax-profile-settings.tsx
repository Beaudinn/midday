"use client";

import { Button } from "@midday/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@midday/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@midday/ui/form";
import { Input } from "@midday/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@midday/ui/select";
import { SubmitButton } from "@midday/ui/submit-button";
import { Switch } from "@midday/ui/switch";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { z } from "zod/v3";
import { useZodForm } from "@/hooks/use-zod-form";
import { useTRPC } from "@/trpc/client";

const formSchema = z.object({
  subjectId: z.string().uuid(),
  displayName: z.string().min(1).max(120),
  countryCode: z.string().length(2),
  bsn: z.string().max(32).optional(),
  rsin: z.string().max(32).optional(),
  kvkNumber: z.string().max(32).nullable().optional(),
  vatNumber: z.string().max(32).nullable().optional(),
});

const relationshipTypeValues = [
  "spouse",
  "registered_partner",
  "cohabiting_partner",
  "former_partner",
  "other",
] as const;

const partnerFormSchema = z.object({
  partnerDisplayName: z.string().min(1).max(120),
  partnerCountryCode: z.string().length(2),
  relationshipType: z.enum(relationshipTypeValues),
  fiscalPartner: z.boolean(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;
type PartnerFormValues = z.infer<typeof partnerFormSchema>;

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function normalizeNullable(value?: string | null) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function normalizeDate(value?: string | null) {
  return normalizeNullable(value);
}

function relationshipLabel(value: (typeof relationshipTypeValues)[number]) {
  switch (value) {
    case "spouse":
      return "Spouse";
    case "registered_partner":
      return "Registered partner";
    case "cohabiting_partner":
      return "Cohabiting partner";
    case "former_partner":
      return "Former partner";
    case "other":
      return "Other";
  }
}

export function TaxProfileSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: taxClient } = useSuspenseQuery(trpc.tax.current.queryOptions());
  const primarySubject =
    taxClient?.subjects.find((subject) => subject.role === "primary") ??
    taxClient?.subjects.at(0);

  const updateSubjectMutation = useMutation(
    trpc.tax.updateSubjectIdentity.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.tax.current.queryKey(),
        });
      },
    }),
  );

  const form = useZodForm(formSchema, {
    defaultValues: {
      subjectId: primarySubject?.id ?? "",
      displayName: primarySubject?.displayName ?? "",
      countryCode: primarySubject?.countryCode ?? "NL",
      bsn: "",
      rsin: "",
      kvkNumber: primarySubject?.kvkNumber ?? "",
      vatNumber: primarySubject?.vatNumber ?? "",
    },
  });

  if (!taxClient || !primarySubject) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tax profile</CardTitle>
          <CardDescription>
            No tax profile is active for this team yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const onSubmit = form.handleSubmit((values: FormValues) => {
    updateSubjectMutation.mutate({
      subjectId: values.subjectId,
      displayName: values.displayName,
      countryCode: values.countryCode.toUpperCase(),
      bsn: normalizeOptional(values.bsn),
      rsin: normalizeOptional(values.rsin),
      kvkNumber: normalizeNullable(values.kvkNumber),
      vatNumber: normalizeNullable(values.vatNumber)?.toUpperCase() ?? null,
    });
  });

  return (
    <>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Tax profile</CardTitle>
              <CardDescription>
                These identifiers are used for Dutch tax authorizations and
                filing workflows.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <input type="hidden" {...form.register("subjectId")} />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="organization" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="countryCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="max-w-[120px] uppercase"
                          autoComplete="country"
                          maxLength={2}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="bsn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        BSN
                        {primarySubject.hasBsn && (
                          <span className="ml-2 font-normal text-muted-foreground text-xs">
                            stored
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          autoComplete="off"
                          inputMode="numeric"
                          placeholder={primarySubject.hasBsn ? "Unchanged" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rsin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        RSIN
                        {primarySubject.hasRsin && (
                          <span className="ml-2 font-normal text-muted-foreground text-xs">
                            stored
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          autoComplete="off"
                          inputMode="numeric"
                          placeholder={
                            primarySubject.hasRsin ? "Unchanged" : ""
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="kvkNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>KVK number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          autoComplete="off"
                          inputMode="numeric"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vatNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          className="uppercase"
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>

            <CardFooter className="flex justify-between">
              <div className="text-muted-foreground text-xs">
                BSN and RSIN are stored encrypted.
              </div>
              <SubmitButton
                isSubmitting={updateSubjectMutation.isPending}
                disabled={updateSubjectMutation.isPending}
              >
                Save
              </SubmitButton>
            </CardFooter>
          </Card>
        </form>
      </Form>

      <TaxPartnerSettings
        primarySubject={primarySubject}
        subjects={taxClient.subjects}
        subjectRelationships={taxClient.subjectRelationships}
      />
    </>
  );
}

function TaxPartnerSettings({
  primarySubject,
  subjects,
  subjectRelationships,
}: {
  primarySubject: {
    id: string;
    countryCode: string;
  };
  subjects: {
    id: string;
    displayName: string;
    countryCode: string;
    role: string;
  }[];
  subjectRelationships: {
    id: string;
    primarySubjectId: string;
    relatedSubjectId: string;
    relationshipType: (typeof relationshipTypeValues)[number];
    fiscalPartner: boolean;
    status: string;
    validFrom: string | null;
    validTo: string | null;
  }[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const relationship =
    subjectRelationships.find(
      (item) =>
        item.primarySubjectId === primarySubject.id && item.status === "active",
    ) ??
    subjectRelationships.find(
      (item) => item.primarySubjectId === primarySubject.id,
    );
  const partnerSubject =
    subjects.find((subject) => subject.id === relationship?.relatedSubjectId) ??
    subjects.find((subject) => subject.role === "partner");

  const savePartnerMutation = useMutation(
    trpc.tax.savePartnerRelationship.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.tax.current.queryKey(),
        });
      },
    }),
  );
  const endPartnerMutation = useMutation(
    trpc.tax.endPartnerRelationship.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.tax.current.queryKey(),
        });
      },
    }),
  );

  const form = useZodForm(partnerFormSchema, {
    defaultValues: {
      partnerDisplayName: partnerSubject?.displayName ?? "",
      partnerCountryCode:
        partnerSubject?.countryCode ?? primarySubject.countryCode ?? "NL",
      relationshipType: relationship?.relationshipType ?? "spouse",
      fiscalPartner: relationship?.fiscalPartner ?? true,
      validFrom: relationship?.validFrom ?? "",
      validTo: relationship?.validTo ?? "",
    },
  });

  const onSubmit = form.handleSubmit((values: PartnerFormValues) => {
    savePartnerMutation.mutate({
      primarySubjectId: primarySubject.id,
      relationshipId: relationship?.id,
      relatedSubjectId: partnerSubject?.id,
      partnerDisplayName: values.partnerDisplayName,
      partnerCountryCode: values.partnerCountryCode.toUpperCase(),
      relationshipType: values.relationshipType,
      fiscalPartner: values.fiscalPartner,
      validFrom: normalizeDate(values.validFrom),
      validTo: normalizeDate(values.validTo),
    });
  });

  const endRelationship = () => {
    if (!relationship) {
      return;
    }

    endPartnerMutation.mutate({
      relationshipId: relationship.id,
      validTo: normalizeDate(form.getValues("validTo")),
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Tax partner</CardTitle>
            <CardDescription>
              Store partner context for income tax filing and year-based
              allocations.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {relationship && (
              <div className="border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium capitalize">
                    {relationship.status}
                  </span>
                  {relationship.validFrom && (
                    <span className="text-muted-foreground">
                      From {relationship.validFrom}
                    </span>
                  )}
                  {relationship.validTo && (
                    <span className="text-muted-foreground">
                      Until {relationship.validTo}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="partnerDisplayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner name</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="partnerCountryCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="max-w-[120px] uppercase"
                        autoComplete="country"
                        maxLength={2}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="relationshipType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {relationshipTypeValues.map((value) => (
                          <SelectItem key={value} value={value}>
                            {relationshipLabel(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fiscalPartner"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex h-9 items-center justify-between border px-3">
                      <FormLabel>Fiscal partner</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid from</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid until</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-between gap-3">
            {relationship?.status === "active" ? (
              <Button
                type="button"
                variant="outline"
                disabled={endPartnerMutation.isPending}
                onClick={endRelationship}
              >
                End relationship
              </Button>
            ) : (
              <div className="text-muted-foreground text-xs">
                Partner is stored as a tax subject in this team.
              </div>
            )}

            <SubmitButton
              isSubmitting={savePartnerMutation.isPending}
              disabled={savePartnerMutation.isPending}
            >
              Save partner
            </SubmitButton>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
