import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth  = require('mammoth')
import type { ExtractLeadDto, ExtractProposalDto, ChatDto } from './dto/extract.dto'

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface ExtractedLead {
  name:       string | null
  email:      string | null
  phone:      string | null
  company:    string | null
  service:    string | null
  budget:     number | null
  source:     string | null
  notes:      string | null
  confidence: number
}

export interface ExtractedProposal {
  title:           string
  scopeItems:      string[]
  deliverables:    string[]
  exclusions:      string[]
  lineItems:       Array<{ description: string; qty: number; rate: number; gstRate: number }>
  paymentSchedule: Array<{ milestone: string; percentage: number }>
  pricingNotes:    string
  terms:           string
  validUntil:      string | null
  suggestedClient: { name: string | null; email: string | null }
  confidence:      number
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const LEAD_SYSTEM_PROMPT = `You are a lead extraction assistant for ClearWork, a business management app for Indian freelancers and agencies.

Extract lead/prospect information from the provided conversation, email, or description.
Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

JSON schema (use null for missing fields):
{
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "company": string | null,
  "service": string | null,
  "budget": number | null,
  "source": "whatsapp" | "email" | "instagram" | "referral" | "website" | "linkedin" | "other" | null,
  "notes": string | null,
  "confidence": number
}

Rules:
- budget must be a plain number in INR (no symbols), null if not mentioned
- source: infer from context clues (WhatsApp formatting, email headers, Instagram mentions, etc.)
- notes: capture important project context, timeline hints, or anything useful — keep under 200 chars
- confidence: 0.0–1.0 reflecting how complete/clear the extraction is
- name is the most important field — always try to find it`

const PROPOSAL_SYSTEM_PROMPT = (pricingContext?: string) => `You are a proposal drafting assistant for ClearWork, a business management app for Indian freelancers and agencies.

Generate a structured proposal draft from the provided project brief, requirement, or client conversation.
Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

${pricingContext ? `Pricing context provided by the user: "${pricingContext}"\nUse this to set realistic rates on line items.` : 'Set all line item rates to 0 — the user will fill them in.'}

JSON schema:
{
  "title": string,
  "scopeItems": string[],
  "deliverables": string[],
  "exclusions": string[],
  "lineItems": [{ "description": string, "qty": number, "rate": number, "gstRate": number }],
  "paymentSchedule": [{ "milestone": string, "percentage": number }],
  "pricingNotes": string,
  "terms": string,
  "validUntil": string | null,
  "suggestedClient": { "name": string | null, "email": string | null },
  "confidence": number
}

Rules:
- title: concise project title (e.g. "Brand Identity Design — Ritu's Cafe")
- scopeItems: 4–12 bullet points of what is included — be thorough, not minimal
- deliverables: 3–8 concrete things client receives
- exclusions: 2–6 things explicitly NOT included (content writing, photography, hosting, etc.)
- lineItems: group work into 2–6 logical billing items. gstRate should be 18 unless clearly exempt
- paymentSchedule: percentages must sum to 100. Typical: 50% upfront + 50% on delivery, or 30/40/30 for longer projects
- pricingNotes: one sentence about payment terms
- terms: 3–5 sentences covering IP ownership, revision policy, late payment, and cancellation
- validUntil: ISO date string 30 days from today (${new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)}), or null
- suggestedClient: extract client name/email if mentioned
- confidence: 0.0–1.0`

const PARSE_TEMPLATE_SYSTEM_PROMPT = (context?: string) => `You are a template extraction assistant for ClearWork, a business management app for Indian freelancers and agencies.

An existing proposal or template document has been provided as text. Your job is to EXTRACT its structure — do NOT invent new content. Read the actual document text and identify:
- The title/name of the service or template
- Scope of work items (what is included)
- Deliverables (tangible outputs)
- Exclusions (what is not included)
- Line items with pricing (billing breakdown)
- Payment schedule
- Terms and conditions
${context ? `\nAdditional context from the user: "${context}"` : ''}

Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

JSON schema:
{
  "title": string,
  "scopeItems": string[],
  "deliverables": string[],
  "exclusions": string[],
  "lineItems": [{ "description": string, "qty": number, "rate": number, "gstRate": number }],
  "paymentSchedule": [{ "milestone": string, "percentage": number }],
  "pricingNotes": string,
  "terms": string,
  "validUntil": null,
  "suggestedClient": { "name": null, "email": null },
  "confidence": number
}

Rules:
- Extract content faithfully from the document — do not add or invent scope items or terms
- scopeItems: clear, descriptive phrases (8–15 words each) that fully describe each scope area
- deliverables: specific, tangible outputs the client receives (8–15 words each)
- exclusions: clear phrases stating what is NOT included (6–12 words each)
- terms: write a complete paragraph of 5–8 sentences covering IP ownership, revision rounds allowed, late payment policy, cancellation terms, and project timeline assumptions — extract faithfully from the document, do not invent
- pricingNotes: 1–2 sentences on payment expectations or billing terms from the document
- If rates are mentioned, use them; if amounts include GST, back-calculate the base rate
- gstRate: use 18 as default if not explicitly mentioned, 0 if document says exempt
- paymentSchedule percentages must sum to 100
- confidence: 0.0–1.0 reflecting how complete/clear the extracted content is
- If a section is not present in the document, return an empty array for that field`

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    const key = this.config.get<string>('geminiApiKey')
    if (!key) throw new BadRequestException('Gemini API key not configured')
    return key
  }

  private async callGemini(systemPrompt: string, dto: ExtractLeadDto | ExtractProposalDto, maxOutputTokens = 2048): Promise<string> {
    const parts: unknown[] = []

    if (dto.imageBase64 && dto.mimeType) {
      parts.push({
        inlineData: {
          mimeType: dto.mimeType,
          data:     dto.imageBase64,
        },
      })
    }

    const userText = dto.text?.trim()
    if (userText) {
      parts.push({ text: userText })
    }

    if (parts.length === 0) {
      throw new BadRequestException('Provide text or an image')
    }

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature:      0.2,
        maxOutputTokens:  maxOutputTokens,
      },
    }

    let res: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 1500))
      res = await fetch(GEMINI_API, {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'X-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
      })
      if (res.status !== 503) break
    }

    if (!res!.ok) {
      const err = await res!.text()
      this.logger.error(`Gemini error ${res!.status}: ${err}`)
      const msg = res!.status === 503
        ? 'AI service is temporarily busy — please try again in a moment'
        : 'AI extraction failed — please try again'
      throw new BadRequestException(msg)
    }

    const json = await res!.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return text
  }

  async extractLead(dto: ExtractLeadDto): Promise<ExtractedLead> {
    const raw = await this.callGemini(LEAD_SYSTEM_PROMPT, dto)
    try {
      const parsed = JSON.parse(raw) as ExtractedLead
      return {
        name:       parsed.name       ?? null,
        email:      parsed.email      ?? null,
        phone:      parsed.phone      ?? null,
        company:    parsed.company    ?? null,
        service:    parsed.service    ?? null,
        budget:     typeof parsed.budget === 'number' ? parsed.budget : null,
        source:     parsed.source     ?? null,
        notes:      parsed.notes      ?? null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      }
    } catch {
      this.logger.error('Lead JSON parse failed', raw)
      throw new BadRequestException('Could not parse AI response — try rephrasing')
    }
  }

  async extractProposal(dto: ExtractProposalDto): Promise<ExtractedProposal> {
    const systemPrompt = PROPOSAL_SYSTEM_PROMPT((dto as ExtractProposalDto).pricingContext)
    const raw = await this.callGemini(systemPrompt, dto, 4096)
    try {
      const parsed = JSON.parse(raw) as ExtractedProposal
      return {
        title:           parsed.title           || 'Untitled Proposal',
        scopeItems:      Array.isArray(parsed.scopeItems)      ? parsed.scopeItems      : [],
        deliverables:    Array.isArray(parsed.deliverables)    ? parsed.deliverables    : [],
        exclusions:      Array.isArray(parsed.exclusions)      ? parsed.exclusions      : [],
        lineItems:       Array.isArray(parsed.lineItems)       ? parsed.lineItems       : [],
        paymentSchedule: Array.isArray(parsed.paymentSchedule) ? parsed.paymentSchedule : [],
        pricingNotes:    parsed.pricingNotes    || '',
        terms:           parsed.terms           || '',
        validUntil:      parsed.validUntil      ?? null,
        suggestedClient: parsed.suggestedClient ?? { name: null, email: null },
        confidence:      typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      }
    } catch {
      this.logger.error('Proposal JSON parse failed', raw)
      throw new BadRequestException('Could not parse AI response — try rephrasing')
    }
  }

  async parseTemplate(file: Express.Multer.File | undefined, context?: string, rawText?: string): Promise<ExtractedProposal> {
    let extractedText = ''

    if (rawText?.trim()) {
      extractedText = rawText.trim()
    } else if (file) {
      const mime = file.mimetype
      if (mime === 'application/pdf') {
        const parser = new PDFParse({ data: file.buffer })
        const result = await parser.getText()
        extractedText = result.text?.trim() ?? ''
      } else if (
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mime === 'application/msword'
      ) {
        const result = await mammoth.extractRawText({ buffer: file.buffer })
        extractedText = result.value?.trim() ?? ''
      } else {
        throw new BadRequestException('Only PDF and DOCX files are supported')
      }
    } else {
      throw new BadRequestException('Provide a file or text to parse')
    }

    if (!extractedText) throw new BadRequestException('Could not extract text from the file — ensure it is not a scanned image')

    // Cap input to ~15k chars — enough for any real proposal, avoids Gemini input overload
    const inputText = extractedText.length > 15000 ? extractedText.slice(0, 15000) : extractedText

    const systemPrompt = PARSE_TEMPLATE_SYSTEM_PROMPT(context)
    const raw = await this.callGemini(systemPrompt, { text: inputText }, 8192)

    // Strip markdown code fences Gemini occasionally adds despite responseMimeType: json
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    try {
      const parsed = JSON.parse(cleaned) as ExtractedProposal
      return {
        title:           parsed.title           || 'Untitled Template',
        scopeItems:      Array.isArray(parsed.scopeItems)      ? parsed.scopeItems      : [],
        deliverables:    Array.isArray(parsed.deliverables)    ? parsed.deliverables    : [],
        exclusions:      Array.isArray(parsed.exclusions)      ? parsed.exclusions      : [],
        lineItems:       Array.isArray(parsed.lineItems)       ? parsed.lineItems       : [],
        paymentSchedule: Array.isArray(parsed.paymentSchedule) ? parsed.paymentSchedule : [],
        pricingNotes:    parsed.pricingNotes    || '',
        terms:           parsed.terms           || '',
        validUntil:      null,
        suggestedClient: { name: null, email: null },
        confidence:      typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      }
    } catch {
      this.logger.error(`Template parse JSON failed — raw (first 500): ${cleaned.slice(0, 500)}`)
      throw new BadRequestException('Could not parse AI response — try again')
    }
  }

  async chat(dto: ChatDto): Promise<{ reply: string }> {
    const SYSTEM_PROMPT = `You are ClearWork Assistant, a knowledgeable and friendly business advisor for freelancers, consultants, and agencies worldwide.
You help with: proposals and contracts, invoicing and payment terms, client management, GST (India) and general tax obligations, late payment handling, project scoping, freelance pricing strategy, business operations, and general questions about running a service business.

Rules:
- Answer in clear, plain language — avoid jargon unless you explain it
- Keep responses concise but complete — 2-5 sentences for simple questions, more for complex multi-step topics
- When discussing Indian users: use ₹, reference GST, TDS (194J, 194C), ITR, Section 44ADA, GSTR-1/3B
- When discussing international users: use their local currency context, refer to general tax/invoicing best practices
- If a question is outside your domain (not business/freelance/client management related), politely redirect
- Never give definitive legal or financial advice — suggest consulting a local accountant or lawyer for complex situations
- Respond in the same language as the user
- Do not use markdown formatting — no **, ##, *, bullet hyphens, or backticks. Plain text only.`

    const contents = [
      ...(dto.history ?? []).map(h => ({
        role:  h.role,
        parts: [{ text: h.content }],
      })),
      { role: 'user', parts: [{ text: dto.message }] },
    ]

    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature:     0.6,
        maxOutputTokens: 1024,
      },
    }

    let res: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 1500))
      res = await fetch(GEMINI_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': this.apiKey },
        body:    JSON.stringify(body),
      })
      if (res.status !== 503) break
    }

    if (!res!.ok) {
      const errBody = await res!.text()
      this.logger.error(`Gemini chat error ${res!.status}: ${errBody}`)
      const detail = `${res!.status}: ${errBody.slice(0, 300)}`
      throw new BadRequestException(`AI unavailable — ${detail}`)
    }

    const json = await res!.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? 'Sorry, I could not generate a response. Please try again.'
    return { reply }
  }
}
