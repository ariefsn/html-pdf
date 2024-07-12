import { JsonOk } from '@src/helper';
import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const root: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  const withZod = fastify.withTypeProvider<ZodTypeProvider>();

  withZod.get('/', {
    schema: {
      description: 'Ping endpoint',
      tags: ['APP'],
      summary: 'Ping endpoint',
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
    }
  }, async function (request, reply) {
    return JsonOk('Welcome to HTML PDF gen')
  })
}

export default root;
