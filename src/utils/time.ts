/**
 * @file time.ts
 * @purpose Timestamp formatting utility for WIB (Asia/Jakarta) timezone
 * @usedBy alerting services, telegram admin controller
 * @deps Intl.DateTimeFormat
 * @exports formatTimestampWIB
 * @sideEffects None
 */

export const formatTimestampWIB = (date: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('day')} ${pick('month')} ${pick('year')}, ${pick(
    'hour'
  )}:${pick('minute')}:${pick('second')} WIB`;
};
