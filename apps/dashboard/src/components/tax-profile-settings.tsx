"use client";

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
import { SubmitButton } from "@midday/ui/submit-button";
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

type FormValues = z.infer<typeof formSchema>;

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function normalizeNullable(value?: string | null) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
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
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Tax profile</CardTitle>
            <CardDescription>
              These identifiers are used for Dutch tax authorizations and filing
              workflows.
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
                        placeholder={primarySubject.hasRsin ? "Unchanged" : ""}
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
  );
}
