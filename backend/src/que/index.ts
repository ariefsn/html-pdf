import { TPdfDto } from "@src/entities"
import { handlebars, htmlUnescaped } from "@src/helper"
import { connect, NatsConnection } from "nats"
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

const initNats = async () => {
  if (nc) {
    return
  }
  const queUrl = process.env.QUEUE_URL
  if (!queUrl) {
    throw new Error('Missing QUEUE_URL')
  }
  if (!nc) {
    try {
      nc = await connect({
        servers: [queUrl],
      })
      console.log('[NATS] Connected.')
    } catch (error) {
      console.log('[NATS] Error:', error)
    }
  }
}

const natsClient = () => nc!

const startSub = async () => {
  await initNats()
  const getDeltaTime = (time: number) => time + 'ms'
  const subject = process.env.QUEUE_SUBSCRIBE || 'generate.>'
  console.log(`[NATS] Subscribing to ${subject}...`, nc?.info)
  nc!.subscribe(subject, {
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
            console.log('[PDF] Send to Webhook: ' + webhookUrl)
            fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
            })
          }
        } catch (error) {
          console.log('[PDF] Error:', error)
        }
      }
    },
  });
}

export { initNats, natsClient, startSub }
