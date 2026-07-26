import { JsonOk } from "@src/helper";
import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { pdfDtoSchema } from "@src/entities";
import { JSONCodec } from 'nats';
import { z } from "zod";

const pdf: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  const withZod = fastify.withTypeProvider<ZodTypeProvider>();

  withZod.post('/', {
    schema: {
      body: pdfDtoSchema,
      tags: ['PDF'],
      response: {
        200: z.object({
          success: z.boolean(),
          data: z.string().nullable(),
          message: z.string(),
          details: z.array(z.object({
            keyword: z.string(),
            instancePath: z.string(),
            schemaPath: z.string(),
            message: z.string().optional(),
            params: z.record(z.string(), z.any()).optional(),
          })).optional().nullable(),
        })
      }
    },
  }, async function (request, reply) {
    const jc = JSONCodec();

    fastify.nats().publish(fastify.config.QUEUE_SUBJECT ?? 'generate.pdf', jc.encode(request.body));

    return reply.send(JsonOk('ok'))
  })
}

export default pdf;
