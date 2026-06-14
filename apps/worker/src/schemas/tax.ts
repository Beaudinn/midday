import { z } from "zod";

export const processTaxDigipoortJobSchema = z.object({
  teamId: z.string().uuid(),
  jobId: z.string().uuid(),
  operation: z.enum([
    "request_mandate",
    "activate_mandate",
    "fetch_service_messages",
    "submit_return",
  ]),
});

export type ProcessTaxDigipoortJobPayload = z.infer<
  typeof processTaxDigipoortJobSchema
>;
