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
  // Order below is deliberate and every step is awaited. Previously the
  // registrations were fire-and-forget and only worked because avvio defers
  // them past the synchronous compiler setup at the end of this function.
  // Relying on that scheduling is fragile: if routes were ever built before
  // the compilers were installed they would silently fall back to Ajv,
  // ignoring the zod schemas and turning 400s into 500s.

  // 1. Type provider compilers first -- they must precede any route
  //    registration so routes compile against zod.
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  // 2. Env, so fastify.config exists for everything below.
  await fastify.register(fastifyEnv, {
    confKey: 'config',
    schema: envSchema,
  })
  fastify.log.info(`Env Loaded`)

  // 3. Swagger reads route schemas at ready(), so it needs the compilers.
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

  // 4. NATS injection before routes, so `nats` is decorated by the time
  //    route handlers close over the instance.
  //    Tests build the app via fastify.ready(), which drains the whole boot
  //    graph including the awaited initNats() -- so without this gate they
  //    would need a live broker. Deliberately its own variable rather than
  //    NODE_ENV: compose already sets NODE_ENV=production, and an accidental
  //    NODE_ENV=test in a deployment must not disable the queue.
  if (process.env.DISABLE_NATS !== 'true') {
    await fastify.register(fastifyPlugin(async (fastify) => {
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

  // 5. Error handler before routes. Registering it afterwards would leave
  //    it on the root instance while the awaited AutoLoad below builds an
  //    encapsulated child, so route errors would never reach it and clients
  //    would get Fastify's raw FST_ERR_VALIDATION body instead of the
  //    JsonError envelope.
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      let msg = 'Invalid input'
      reply.status(400).send(JsonError(msg, error.issues))
      return
    }

    reply.send(error)
  })

  // 6. Routes last.
  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: opts,
    forceESM: true
  })
};

export default app;
export { app, options };

