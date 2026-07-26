import { JsonOk } from "@src/helper";
import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { apiResponseSchema, pdfDtoSchema } from "@src/entities";
import { JSONCodec } from 'nats';

const pdf: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  const withZod = fastify.withTypeProvider<ZodTypeProvider>();

  withZod.post('/', {
    schema: {
      body: pdfDtoSchema,
      tags: ['PDF'],
      response: {
        200: apiResponseSchema
      }
    },
  }, async function (request, reply) {
    const jc = JSONCodec();

    // `||` not `??`: an env var that is set but empty gets past both the
    // schema default (which only fills missing keys) and a nullish check,
    // and publishing to '' fails with BAD_SUBJECT.
    const subject = fastify.config.QUEUE_SUBJECT || 'generate.pdf'

    fastify.nats().publish(subject, jc.encode(request.body));

    return reply.send(JsonOk('ok'))
  })
}

export default pdf;
