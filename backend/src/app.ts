import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload';
import fastifyEnv from '@fastify/env';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { NatsConnection } from 'nats';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ZodError } from 'zod';
import { JsonError } from './helper';
import { initNats, natsClient, startSub } from './que';

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      PORT: string
      QUEUE_URL: string
      QUEUE_SUBJECT: string
      QUEUE_SUBSCRIBE: string
    };
    nats: () => NatsConnection
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envSchema = {
  type: 'object',
  required: ['QUEUE_URL'],
  properties: {
    PORT: { type: 'string', default: '3000' },
    QUEUE_URL: { type: 'string' },
    QUEUE_SUBJECT: { type: 'string', default: 'generate.pdf' },
    QUEUE_SUBSCRIBE: { type: 'string', default: 'generate.>' },
  },
}

export type AppOptions = {
  // Place your custom options for app below here.
  logger: boolean
} & Partial<AutoloadPluginOptions>;


// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {
  logger: false,
}

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts
): Promise<void> => {
  // Place here your custom code!
  // Swagger
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Html Pdf Docs',
        description: 'Documentation for the Html Pdf API',
        version: '0.1.0'
      },
      servers: [
        {
          url: 'http://localhost:' + process.env.PORT,
          description: 'App server'
        }
      ],
      tags: [
        { name: 'APP', description: 'App related end-points' },
        { name: 'PDF', description: 'PDF related end-points' },
      ],
      components: {
      },
      externalDocs: {
        url: 'https://swagger.io',
        description: 'Find more info here'
      },
    },
    transform: jsonSchemaTransform
  })

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    },
    uiHooks: {
      onRequest: function (request: any, reply: any, next: () => void) { next() },
      preHandler: function (request: any, reply: any, next: () => void) { next() }
    },
    staticCSP: true,
    transformStaticCSP: (header: any) => header,
    transformSpecification: (swaggerObject: any, request: any, reply: any) => { return swaggerObject },
    transformSpecificationClone: true
  })

  // This loads all plugins defined in routes
  // define your routes in one of these
  void fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: opts,
    forceESM: true
  })

  // Env
  void fastify.register(fastifyEnv, {
    confKey: 'config',
    schema: envSchema,
  }).after(() => {
    fastify.log.info(`Env Loaded`)
  })

  // Inject
  // Tests build the app via fastify.ready(), which drains the whole boot
  // graph including the awaited initNats() below -- so without this gate
  // they would need a live broker. Deliberately its own variable rather
  // than NODE_ENV: compose already sets NODE_ENV=production, and an
  // accidental NODE_ENV=test in a deployment must not disable the queue.
  if (process.env.DISABLE_NATS !== 'true') {
    void fastify.register(fastifyPlugin(async (fastify, opts) => {
      await initNats()
      fastify.decorate('nats', () => natsClient())

      // Not awaited so boot isn't blocked, but a rejection must surface rather
      // than becoming an unhandled promise rejection.
      startSub().catch((err) => fastify.log.error(err)) // start subscription
    }))
  } else {
    // Still decorate, so routes resolve and validation runs; only a request
    // that passes validation reaches this and fails loudly.
    fastify.decorate('nats', () => {
      throw new Error('NATS disabled (DISABLE_NATS=true)')
    })
  }

  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      let msg = 'Invalid input'
      reply.status(400).send(JsonError(msg, error.issues))
      return
    }

    reply.send(error)
  })
};

export default app;
export { app, options };

