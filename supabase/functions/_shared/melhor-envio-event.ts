export type MelhorEnvioShipmentEvent = {
  providerShipmentId: string;
  eventType: string;
  targetStatus: string;
  trackingCode: string | null;
  occurredAt: string;
  safeMetadata: Record<string, unknown>;
};

const SHIPMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_BY_EVENT: Record<string, string> = {
  'order.created': 'quoted',
  'order.pending': 'awaiting_payment',
  'order.released': 'ready',
  'order.generated': 'ready',
  'order.received': 'in_transit',
  'order.posted': 'posted',
  'order.delivered': 'delivered',
  'order.cancelled': 'cancelled',
  'order.undelivered': 'exception',
  'order.paused': 'exception',
  'order.suspended': 'exception',
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function nonEmptyString(value: unknown, max = 160): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function eventTime(eventType: string, data: JsonRecord, receivedAt: Date): string {
  const suffix = eventType.slice('order.'.length).replace(/[^a-z]/g, '');
  const candidates = [data[`${suffix}_at`], data.updated_at, data.created_at];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime()) && date.getTime() <= receivedAt.getTime() + 24 * 60 * 60 * 1000) {
      return date.toISOString();
    }
  }
  return receivedAt.toISOString();
}

/** Extract only fields needed by the state transition; provider PII is discarded. */
export async function extractMelhorEnvioShipmentEvent(
  payloadValue: unknown,
  receivedAt = new Date(),
): Promise<MelhorEnvioShipmentEvent | null> {
  const payload = record(payloadValue);
  if (!payload) return null;

  const eventType = nonEmptyString(payload.event, 40);
  const targetStatus = eventType ? STATUS_BY_EVENT[eventType] : undefined;
  if (!eventType || !targetStatus) return null;

  const data = record(payload.data);
  const providerShipmentId = nonEmptyString(data?.id, 64);
  if (!providerShipmentId || !SHIPMENT_ID_PATTERN.test(providerShipmentId)) return null;

  const trackingValue = nonEmptyString(data?.tracking, 40);
  const trackingCode = trackingValue && /^[A-Za-z0-9-]{4,40}$/.test(trackingValue)
    ? trackingValue
    : null;
  const occurredAt = eventTime(eventType, data ?? {}, receivedAt);
  const status = nonEmptyString(data?.status, 40);
  return {
    providerShipmentId,
    eventType,
    targetStatus,
    trackingCode,
    occurredAt,
    safeMetadata: {
      provider_shipment_id: providerShipmentId,
      event: eventType,
      status: status ?? eventType.slice('order.'.length),
      tracking_present: trackingCode !== null,
    },
  };
}

