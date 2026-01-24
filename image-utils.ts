import { requestUrl } from 'obsidian';
import { createUuid } from './id-utils';

export function resolveImageUrl(img: HTMLImageElement, baseUrl: URL) {
    const src =
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        pickFromSrcset(img.getAttribute('srcset'));

    if (!src) return null;
    if (src.startsWith('//')) return `https:${src}`;
    if (src.startsWith('/')) return `${baseUrl.origin}${src}`;

    try {
        return new URL(src, baseUrl.origin).toString();
    } catch (error) {
        return null;
    }
}

export function pickFromSrcset(srcset: string | null) {
    if (!srcset) return null;

    const first = srcset.split(',')[0]?.trim();

    if (!first) return null;

    return first.split(' ')[0];
}

export function getImageExtension(url: string) {
    try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('.');
        const extension = parts[parts.length - 1];

        if (!extension || extension.length > 5) return null;

        return extension.toLowerCase();
    } catch (error) {
        return null;
    }
}

export function getImageExtensionFromMimeType(mimeType?: string | null) {
    if (!mimeType) return null;

    const normalized = mimeType.split(';')[0]?.trim().toLowerCase();

    switch (normalized) {
        case 'image/jpeg':
            return 'jpg';
        case 'image/jpg':
            return 'jpg';
        case 'image/png':
            return 'png';
        case 'image/gif':
            return 'gif';
        case 'image/webp':
            return 'webp';
        case 'image/avif':
            return 'avif';
        case 'image/svg+xml':
            return 'svg';
        case 'image/bmp':
            return 'bmp';
        case 'image/tiff':
            return 'tiff';
        default:
            return null;
    }
}

export async function fetchImageData(url: string) {
    try {
        const response = await requestUrl({ url, method: 'GET' });

        if (!response.arrayBuffer) {
            throw new Error('No binary data');
        }

        return {
            data: response.arrayBuffer,
            mimeType: response.headers?.['content-type'],
        };
    } catch (error) {
        console.error(`Failed to download ${url}`, error);

        return null;
    }
}

export async function hashArrayBuffer(data: ArrayBuffer) {
    if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', data);

        return bufferToHex(digest);
    }

    try {
        const { createHash } = await import('crypto');
        const buffer = Buffer.from(data);

        return createHash('sha256').update(buffer).digest('hex');
    } catch (error) {
        return createUuid().replace(/[^a-f0-9]/gi, '');
    }
}

export function bufferToHex(buffer: ArrayBuffer) {
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}
