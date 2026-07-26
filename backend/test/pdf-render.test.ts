import * as assert from 'node:assert'
import { test } from 'node:test'
import puppeteer from 'puppeteer'

// Opt-in: launching Chromium is slow and needs a browser present, so this
// stays out of the default run. Enable it around any puppeteer upgrade:
//   RUN_PDF_SMOKE=1 yarn test
// Mirrors the setContent -> pdf() sequence in src/que/index.ts rather than
// importing it, since getBrowser is deliberately not exported.
test('renders a PDF', { skip: !process.env.RUN_PDF_SMOKE }, async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
    args: [
      '--no-sandbox',
      '--headless',
      '--disable-gpu',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(
      '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><h1>smoke</h1></body></html>',
      { waitUntil: 'networkidle2' },
    )
    const pdf = await page.pdf({ format: 'a4', printBackground: true })

    // Buffer.from(pdf) -- not pdf.buffer -- so a pooled view stays correct.
    const buf = Buffer.from(pdf)
    assert.ok(buf.length > 0, 'pdf should not be empty')
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-')
    assert.ok(buf.subarray(-8).toString().includes('%%EOF'), 'pdf should be terminated')
  } finally {
    await browser.close()
  }
})
