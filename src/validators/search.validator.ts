import { z } from "zod";

export const searchSchema = z.strictObject({
  query: z
    .string({ error: "Query is required" })
    .trim()
    .min(1, "Query is required")
    .max(1000, "Query cannot exceed 1000 characters"),
  limit: z
    .number({ error: "Limit must be a number" })
    .int("Limit must be a whole number")
    .min(1, "Limit must be at least 1")
    .max(20, "Limit cannot exceed 20")
    .default(5),
});

export type SearchBody = z.infer<typeof searchSchema>;
