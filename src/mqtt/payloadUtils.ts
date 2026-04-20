/**
 * @file payloadUtils.ts
 * @purpose Helpers for parsing MQTT payload metadata
 * @usedBy mqtt message router
 * @deps none
 * @exports toOptionalNumber, toBooleanFlag
 * @sideEffects None
 */

export const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const toBooleanFlag = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1 || value === '1';
