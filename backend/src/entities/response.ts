import { z } from "zod"

// Mirrors the JsonOk / JsonError envelope in src/helper/http.ts.
//
// `details` carries Fastify's validation errors, which is what the zod type
// provider hands the error handler. message and params are optional on
// purpose: a response schema stricter than what is actually emitted turns a
// 400 into a serialization 500.
export const responseDetailSchema = z.object({
  keyword: z.string(),
  instancePath: z.string(),
  schemaPath: z.string(),
  message: z.string().optional(),
  params: z.record(z.string(), z.any()).optional(),
})

export const apiResponseSchema = z.object({
  success: z.boolean(),
  data: z.string().nullable(),
  message: z.string(),
  details: z.array(responseDetailSchema).optional().nullable(),
})
