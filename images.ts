import { resolveImageUrl } from './image-utils';

export function collectImageUrls(articleEl: Element, baseUrl: URL) {
    const urls: string[] = [];
    const seen = new Set<string>();
    const images = Array.from(articleEl.querySelectorAll('img'));

    for (const img of images) {
        const src = resolveImageUrl(img, baseUrl);

        if (!src || src.startsWith('data:')) continue;

        img.setAttribute('src', src);

        if (seen.has(src)) continue;

        seen.add(src);
        urls.push(src);
    }

    return urls;
}
