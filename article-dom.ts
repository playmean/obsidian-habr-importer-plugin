import type { ArticleMeta } from './types';

export function findArticleElement(doc: Document) {
    return (
        doc.querySelector('.article-body') ??
        doc.querySelector('article.tm-article-presenter__content') ??
        doc.querySelector('article') ??
        doc.querySelector('.tm-article-body') ??
        doc.querySelector('.article-formatted-body')
    );
}

export function extractMeta(doc: Document, url: string): ArticleMeta {
    const title =
        doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
        doc.querySelector('h1')?.textContent?.trim() ||
        'Habr Article';

    const author =
        doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
        doc.querySelector('[rel="author"]')?.textContent?.trim() ||
        undefined;

    const published =
        doc
            .querySelector('meta[property="article:published_time"]')
            ?.getAttribute('content')
            ?.trim() ||
        doc.querySelector('time')?.getAttribute('datetime')?.trim() ||
        undefined;

    return {
        title,
        author,
        published,
        url,
    };
}

export function cleanArticle(articleEl: Element) {
    const selectorsToRemove = [
        'script',
        'style',
        'noscript',
        '.tm-article-stats',
        '.tm-article-snippet__stats',
        '.tm-article-presentation__meta',
        '.tm-article-presenter__meta',
    ];

    selectorsToRemove.forEach((selector) => {
        articleEl.querySelectorAll(selector).forEach((el) => el.remove());
    });

    // Obsidian does not support images wrapped in links.
    articleEl.querySelectorAll('a > img').forEach((img) => {
        const anchor = img.parentElement;

        if (!anchor) return;

        anchor.replaceWith(img);
    });
}
