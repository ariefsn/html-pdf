import { TPdfDto } from "@src/entities"
import { handlebars, htmlUnescaped } from "@src/helper"
import { connect, NatsConnection } from "nats"
import puppeteer, { PaperFormat } from "puppeteer"

let nc: NatsConnection | null = null

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
  console.log('[NATS] Subscribing to generate.pdf...', nc?.info)
  nc!.subscribe("generate.pdf", {
    timeout: 60000,
    async callback(err, msg) {
      if (err) {
        console.log('[NATS] Error Callback:', err)
        return
      }

      if (msg) {
        try {
          const payload = msg.json<TPdfDto>()
          console.log('[NATS] Message Payload:', payload)

          const { html, values, header, footer, margin, format, width, height } = payload;

          const WEBHOOK_URL = process.env.WEBHOOK_URL;

          const start = Date.now()
          console.log('[PDF] Parsing HTML...')

          const template = handlebars.compile(htmlUnescaped(html));
          const htmlParsed = template(values);

          const parsingTime = Date.now() - start
          console.log('[PDF] Parsing HTML Done. Rendering PDF...', getDeltaTime(parsingTime))

          const browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
            args: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-setuid-sandbox'],
            // timeout: 0,
          });
          const page = await browser.newPage();
          await page.setContent(htmlParsed, {
            waitUntil: 'networkidle2',
          });
          const pdf = await page.pdf({
            format: format as PaperFormat,
            width: width,
            height: height,
            printBackground: true,
            headerTemplate: header,
            footerTemplate: footer,
            displayHeaderFooter: ((header ?? '') || (footer ?? '')).trim() ? true : false,
            margin: margin,
          });
          await browser.close();

          const renderingTime = Date.now() - start
          console.log('[PDF] Rendering PDF Done. ', getDeltaTime(renderingTime))

          if (WEBHOOK_URL) {
            let alias = ''
            if (payload.alias) {
              alias = payload.alias
              if (alias.endsWith('.pdf')) {
                alias = alias.slice(0, -4)
              }
            }
            const url = WEBHOOK_URL + ('?alias=' + alias);
            console.log('[PDF] Send to Webhook: ' + url)
            fetch(url, {
              method: 'POST',
              headers: {},
              body: pdf.buffer,
            })
          }
        } catch (error) {
          console.log('[PDF] Error:', error)
        }
      }
    },
  });
  // (async () => {
  //   for await (const msg of sub) {
  //     try {
  //       const payload = msg.json<TPdfDto>()

  //       const { html, values, header, footer, margin, format, width, height } = payload;

  //       const WEBHOOK_URL = process.env.WEBHOOK_URL;

  //       const start = Date.now()
  //       console.log('[PDF] Parsing HTML...')

  //       const template = handlebars.compile(htmlUnescaped(html));
  //       const htmlParsed = template(values);

  //       const parsingTime = Date.now() - start
  //       console.log('[PDF] Parsing HTML Done. Rendering PDF...', getDeltaTime(parsingTime))

  //       const browser = await puppeteer.launch({
  //         args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
  //         timeout: 0,
  //       });
  //       const page = await browser.newPage();
  //       await page.setContent(htmlParsed, {
  //         waitUntil: 'networkidle2',
  //       });
  //       const pdf = await page.pdf({
  //         format: format as PaperFormat,
  //         width: width,
  //         height: height,
  //         printBackground: true,
  //         headerTemplate: header,
  //         footerTemplate: footer,
  //         displayHeaderFooter: ((header ?? '') || (footer ?? '')).trim() ? true : false,
  //         margin: margin,
  //       });
  //       await browser.close();

  //       const renderingTime = Date.now() - start
  //       console.log('[PDF] Rendering PDF Done. ', getDeltaTime(renderingTime))

  //       if (WEBHOOK_URL) {
  //         let alias = ''
  //         if (payload.alias) {
  //           alias = payload.alias
  //           if (alias.endsWith('.pdf')) {
  //             alias = alias.slice(0, -4)
  //           }
  //         }
  //         const url = WEBHOOK_URL + ('?alias=' + alias);
  //         console.log('[PDF] Send to Webhook: ' + url)
  //         fetch(url, {
  //           method: 'POST',
  //           headers: {},
  //           body: pdf.buffer,
  //         })
  //       }
  //     } catch (error) {
  //       console.log('[PDF] Error:', error)
  //     }
  //   }
  // });
}

export { initNats, natsClient, startSub }
