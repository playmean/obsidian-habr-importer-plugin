import TurndownService from 'turndown';
import { tables } from 'turndown-plugin-gfm';
import type { ArticleMeta } from './types';
import { cleanArticle } from './article-dom';
import { collectImageUrls } from './images';
import { extractCodeLanguage } from './text-utils';

export function prepareMarkdown(articleEl: Element, meta: ArticleMeta) {
    cleanArticle(articleEl);

    const baseUrl = new URL(meta.url);
    const imageUrls = collectImageUrls(articleEl, baseUrl);

    const turndown = new TurndownService({
        codeBlockStyle: 'fenced',
        fence: '```',
        headingStyle: 'atx',
        emDelimiter: '_',
    });

    turndown.use(tables);

    turndown.addRule('tableCell', {
        filter: ['th', 'td'],
        replacement: (content: string, node: HTMLElement) => {
            const normalized = normalizeTableCellContent(content);

            return formatTableCell(normalized, node);
        },
    });

    turndown.addRule('fencedCodeBlock', {
        filter: (node: HTMLElement) =>
            node.nodeName === 'PRE' &&
            node.firstChild instanceof HTMLElement &&
            node.firstChild.nodeName === 'CODE',
        replacement: (_content: string, node: HTMLElement) => {
            const codeNode = node.firstChild as HTMLElement;
            const code = codeNode.textContent ?? '';
            const className = codeNode.getAttribute('class') ?? '';
            const language = extractCodeLanguage(className);

            return `\n\n\
${'```'}${language}\n${code}\n${'```'}\n\n`;
        },
    });

    turndown.addRule('iframeToLink', {
        filter: (node: HTMLElement) => node.nodeName === 'IFRAME',
        replacement: (_content: string, node: HTMLElement) => {
            const src = node.getAttribute('src');

            if (!src) return '';

            return `\n\n[Embedded content](${src})\n\n`;
        },
    });

    const markdown = turndown.turndown(articleEl as HTMLElement);

    return { markdown, imageUrls };
}

function normalizeTableCellContent(content: string) {
    const lines = content
        .replace(/\r?\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    return lines.join('<br>');
}

function formatTableCell(content: string, node: HTMLElement) {
    const parent = node.parentNode;
    const siblings = parent?.childNodes ?? [];
    const index = Array.prototype.indexOf.call(siblings, node);
    const prefix = index === 0 ? '| ' : ' ';

    return `${prefix}${content} |`;
}
