// Meta sends a complex nested structure; we accept raw JSON and parse manually
// Full schema: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export interface MetaWebhookStatusEntry {
  id:       string   // waMessageId
  status:   'sent' | 'delivered' | 'read' | 'failed'
  errors?:  Array<{ code: number; title: string }>
}

export interface MetaWebhookValue {
  messaging_product: string
  statuses?:         MetaWebhookStatusEntry[]
}

export interface MetaWebhookChange {
  value: MetaWebhookValue
  field: string
}

export interface MetaWebhookEntry {
  id:      string
  changes: MetaWebhookChange[]
}

export interface MetaWebhookPayload {
  object: string
  entry:  MetaWebhookEntry[]
}
