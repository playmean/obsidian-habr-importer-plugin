export function createUuid() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }

    const time = Date.now().toString(16);
    const random = Math.random().toString(16).slice(2);

    return `${time}-${random}`;
}
