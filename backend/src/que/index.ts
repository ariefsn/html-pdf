import { TPdfDto } from "@src/entities"
import { handlebars, htmlUnescaped } from "@src/helper"
import {
  connect,
  tokenAuthenticator,
  usernamePasswordAuthenticator,
  type Authenticator,
  type ConnectionOptions,
  type NatsConnection,
  type TlsOptions,
} from "nats"
import puppeteer, { Browser, PaperFormat } from "puppeteer"

let nc: NatsConnection | null = null

// Module-level singleton so we launch Chromium once per process instead of
// once per message. Per-request launch saturated the cgroup pids.max under
// the engine's 20-retry receipt backoff and made posix_spawn return EAGAIN.
let browserPromise: Promise<Browser> | null = null

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
        args: [
          '--no-sandbox',
          '--headless',
          '--disable-gpu',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      })
      .then((b: Browser) => {
        // Self-heal: if Chromium dies (OOM, pkill, etc.) drop the cached
        // promise so the next call relaunches instead of awaiting forever.
        b.on('disconnected', () => {
          console.log('[PDF] Browser disconnected; will relaunch on next request.')
          browserPromise = null
        })
        return b
      })
      .catch((err: unknown) => {
        browserPromise = null
        throw err
      })
  }
  return browserPromise
}

type ParsedQueueUrl = {
  servers: string[]
  authenticator?: Authenticator
  tls?: TlsOptions
  mode: 'none' | 'token' | 'user/pass'
}

// The nats.js client discards credentials embedded in the server URL: its
// hostPort() keeps only host+port, and buildAuthenticator() reads nothing from
// the URL. (The Go client and nats CLI do honour userinfo, which is why this
// surprises people.) So we parse QUEUE_URL ourselves and hand the client
// explicit options -- that keeps QUEUE_URL the single connection string.
const parseQueueUrl = (raw: string): ParsedQueueUrl => {
  const entries = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (entries.length === 0) {
    throw new Error('QUEUE_URL is empty')
  }

  const servers: string[] = []
  let authenticator: Authenticator | undefined
  let tls: TlsOptions | undefined
  let mode: ParsedQueueUrl['mode'] = 'none'

  entries.forEach((entry, i) => {
    // `new URL` needs a scheme; a bare host:port is a valid QUEUE_URL too.
    const withScheme = entry.includes('://') ? entry : `nats://${entry}`

    let url: URL
    try {
      url = new URL(withScheme)
    } catch {
      // Never echo the entry itself -- it may carry a password.
      throw new Error(`Invalid QUEUE_URL: entry #${i + 1} is not a valid URL`)
    }

    servers.push(url.host)

    // Credentials and TLS come from the first entry; the rest of a cluster
    // list is the same server from the client's point of view.
    if (i > 0) {
      return
    }

    const user = decodeURIComponent(url.username)
    const pass = decodeURIComponent(url.password)

    // Only ever build one authenticator: buildAuthenticator() merges whatever
    // it is given via Object.assign rather than picking one, so passing two
    // modes would produce a single malformed auth payload.
    if (user && pass) {
      authenticator = usernamePasswordAuthenticator(user, pass)
      mode = 'user/pass'
    } else if (user) {
      authenticator = tokenAuthenticator(user)
      mode = 'token'
    }

    const q = url.searchParams
    const caFile = q.get('tls_ca_file')
    const certFile = q.get('tls_cert_file')
    const keyFile = q.get('tls_key_file')
    const insecure = q.get('tls_insecure') === 'true'

    // The scheme is inert to the client (it strips any protocol), so tls://
    // is free for us to use as the enable-TLS signal.
    if (url.protocol === 'tls:' || q.get('tls') === 'true' || caFile || certFile || keyFile || insecure) {
      const opts: Record<string, unknown> = {}
      if (caFile) opts.caFile = caFile
      if (certFile) opts.certFile = certFile
      if (keyFile) opts.keyFile = keyFile
      // Honoured by the node transport but missing from the public type.
      if (insecure) opts.rejectUnauthorized = false
      tls = opts as TlsOptions
    }
  })

  return { servers, authenticator, tls, mode }
}

const initNats = async () => {
  if (nc) {
    return
  }
  const queUrl = process.env.QUEUE_URL
  if (!queUrl) {
    throw new Error('Missing QUEUE_URL')
  }

  const { servers, authenticator, tls, mode } = parseQueueUrl(queUrl)

  const opts: ConnectionOptions = {
    servers,
    name: 'html-to-pdf',
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000,
    reconnectJitter: 500,
    timeout: 10000,
    ...(authenticator ? { authenticator } : {}),
    ...(tls ? { tls } : {}),
  }

  // Log the parsed servers, never the raw URL -- it may contain a password.
  console.log(`[NATS] Connecting to ${servers.join(',')} (auth=${mode}, tls=${tls ? 'on' : 'off'})`)

  // Let this reject: swallowing it used to leave nc null and turn an auth
  // failure into a "Cannot read properties of null" from startSub().
  nc = await connect(opts)
  console.log('[NATS] Connected.')

  void (async () => {
    for await (const s of nc!.status()) {
      console.log(`[NATS] Status: ${s.type}`, s.data ?? '')
    }
  })().catch(() => { })

  void nc.closed().then((err) => {
    console.log('[NATS] Connection closed.', err ?? '')
    nc = null
  })
}

const natsClient = () => {
  if (!nc) {
    throw new Error('NATS not connected')
  }
  return nc
}

const startSub = async () => {
  await initNats()
  const getDeltaTime = (time: number) => time + 'ms'
  const subject = process.env.QUEUE_SUBSCRIBE || 'generate.>'
  const client = natsClient()
  console.log(`[NATS] Subscribing to ${subject}...`, client.info)
  client.subscribe(subject, {
    timeout: 60000,
    async callback(err, msg) {
      if (err) {
        console.log('[NATS] Error Callback:', err)
        return
      }

      if (msg) {
        try {
          const payload = msg.json() as TPdfDto
          console.log('[NATS] Message Payload:', payload)

          const { html, values, header, footer, margin, format, width, height, webhookUrl, metadata } = payload;

          const start = Date.now()
          console.log('[PDF] Parsing HTML...')

          const template = handlebars.compile(htmlUnescaped(html));
          const htmlParsed = template(values);

          const parsingTime = Date.now() - start
          console.log('[PDF] Parsing HTML Done. Rendering PDF...', getDeltaTime(parsingTime))

          const browser = await getBrowser();
          const page = await browser.newPage();
          let pdf: Uint8Array
          try {
            await page.setContent(htmlParsed, {
              waitUntil: 'networkidle2',
            });
            pdf = await page.pdf({
              format: format as PaperFormat,
              width: width ?? undefined,
              height: height ?? undefined,
              printBackground: true,
              headerTemplate: header ?? undefined,
              footerTemplate: footer ?? undefined,
              displayHeaderFooter: ((header ?? '') || (footer ?? '')).trim() ? true : false,
              margin: margin ?? undefined,
            });
          } finally {
            // Tabs are cheap; never leak one. The browser singleton stays alive.
            await page.close().catch(() => {})
          }

          const renderingTime = Date.now() - start
          console.log('[PDF] Rendering PDF Done. ', getDeltaTime(renderingTime))

          if (webhookUrl) {
            let alias = ''
            if (payload.alias) {
              alias = payload.alias
              if (alias.endsWith('.pdf')) {
                alias = alias.slice(0, -4)
              }
            }
            const webhookPayload = {
              alias,
              metadata: metadata ?? {},
              pdf: Buffer.from(pdf.buffer).toString('base64'),
            }
            const pdfSizeKb = Math.round((pdf.byteLength / 1024) * 10) / 10
            console.log(`[PDF] Send to Webhook: ${webhookUrl} (alias=${alias}, pdf=${pdfSizeKb}KB)`)
            // Await the response so failures surface in logs. Previously the
            // unhandled promise meant DNS errors / non-2xx responses vanished
            // and the receipt stayed in GENERATING forever.
            try {
              const resp = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookPayload),
              })
              if (!resp.ok) {
                const text = await resp.text().catch(() => '')
                console.log(`[PDF] Webhook non-2xx: ${resp.status} ${resp.statusText} body=${text.slice(0, 500)}`)
              } else {
                console.log(`[PDF] Webhook OK: ${resp.status}`)
              }
            } catch (whErr) {
              console.log('[PDF] Webhook POST failed:', whErr)
            }
          }
        } catch (error) {
          console.log('[PDF] Error:', error)
        }
      }
    },
  });
}

export { initNats, natsClient, parseQueueUrl, startSub }
