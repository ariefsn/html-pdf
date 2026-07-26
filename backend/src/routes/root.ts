import { apiResponseSchema } from '@src/entities';
import { JsonOk } from '@src/helper';
import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

const root: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  const withZod = fastify.withTypeProvider<ZodTypeProvider>();

  withZod.get('/', {
    schema: {
      description: 'Ping endpoint',
      tags: ['APP'],
      summary: 'Ping endpoint',
      response: {
        200: apiResponseSchema
      }
    }
  }, async function (request, reply) {
    return JsonOk('Welcome to HTML PDF gen')
  })
}

export default root;
