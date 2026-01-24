export function sanitizeFileName(name: string) {
    return name
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function encodePathForMarkdown(path: string) {
    return encodeURI(path);
}

export function extractCodeLanguage(className: string) {
    const patterns = [
        /language-([\w-]+)/i,
        /lang(?:uage)?-([\w-]+)/i,
        /\b([\w-]+)-language\b/i,
    ];

    for (const pattern of patterns) {
        const match = className.match(pattern);

        if (match?.[1]) {
            return match[1];
        }
    }

    const tokens = className
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);

    if (tokens.length === 0) return '';

    const ignore = new Set(['code', 'highlight', 'hljs', 'language', 'lang']);

    for (const token of tokens) {
        if (!ignore.has(token.toLowerCase())) {
            return token;
        }
    }

    return tokens[0] ?? '';
}
