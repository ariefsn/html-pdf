import { htmlUnescaped } from '@src/helper'
import { ConfigData, HtmlValidate, Result } from 'html-validate/node'
import { z } from "zod"

const hv = new HtmlValidate()

export const pdfDtoSchema = z.object({
  alias: z.string().optional(),
  html: z.string(),
  header: z.string().optional(),
  footer: z.string().optional(),
  margin: z.object({
    top: z.string(),
    right: z.string(),
    bottom: z.string(),
    left: z.string(),
  }).optional(),
  values: z.record(z.any()).optional(),
  format: z.enum(["letter", "legal", "tabloid", "ledger", "a0", "a1", "a2", "a3", "a4", "a5", "a6"]).optional(),
  width: z.string().optional(),
  height: z.string().optional(),
}).superRefine((data, ctx) => {
  const buildHtmlError = (path: string, results: Result[]) => {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid HTML: ' + results.map(r => r.messages.map(m => m.message)).join(', '),
      path: [path],
    })
  }

  const htmlValidateOpt = {
    rules: {
      'no-inline-style': 'off',
      'attr-quotes': ['error', {
        style: 'any',
        'unquoted': false
      }]
    }
  } as ConfigData

  const htmlValidate = hv.validateStringSync(htmlUnescaped(data.html), htmlValidateOpt)

  if (htmlValidate.errorCount > 0) {
    buildHtmlError('html', htmlValidate.results)
  }

  if (data.header) {
    const headerValidate = hv.validateStringSync(htmlUnescaped(data.header), htmlValidateOpt)
    if (headerValidate.errorCount > 0) {
      buildHtmlError('header', headerValidate.results)
    }
  }

  if (data.footer) {
    const footerValidate = hv.validateStringSync(htmlUnescaped(data.footer), htmlValidateOpt)
    if (footerValidate.errorCount > 0) {
      buildHtmlError('footer', footerValidate.results)
    }
  }

})


export type TPdfDto = z.infer<typeof pdfDtoSchema>
