"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTimestampWIB = void 0;
const formatTimestampWIB = (date = new Date()) => {
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
    const pick = (type) => parts.find((part) => part.type === type)?.value ?? '';
    return `${pick('day')} ${pick('month')} ${pick('year')}, ${pick('hour')}:${pick('minute')}:${pick('second')} WIB`;
};
exports.formatTimestampWIB = formatTimestampWIB;
