// import { DIRS, JsonError } from "@helper";
// import { TMap } from "@types";
import { JsonOk } from "@src/helper";
import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
// import fs from 'fs';
// import path from 'path';
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
            code: z.string(),
            fatal: z.boolean(),
            message: z.string(),
            path: z.string(),
          })).optional().nullable(),
        })
      }
    },
  }, async function (request, reply) {
    const jc = JSONCodec();

    fastify.nats().publish('generate.pdf', jc.encode(request.body));

    return reply.send(JsonOk('ok'))
  })
}

export default pdf;
