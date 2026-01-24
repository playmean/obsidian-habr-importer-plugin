import {
    App,
    Modal,
    Notice,
    Plugin,
    TFile,
    moment,
    requestUrl,
    Setting,
    normalizePath,
} from 'obsidian';
import TurndownService from 'turndown';

import { SettingsTab } from './settings-tab';

interface PluginSettings {
    saveFolder: string;
    imagesFolder: string;
    openAfterImport: boolean;
}

const defaultSettings: PluginSettings = {
    saveFolder: 'Habr',
    imagesFolder: 'Habr Images',
    openAfterImport: true,
};

interface ArticleMeta {
    title: string;
    author?: string;
    published?: string;
    url: string;
}

interface DownloadItem {
    url: string;
    path: string;
}

class UrlPromptModal extends Modal {
    private onSubmit: (url: string) => void;

    constructor(app: App, onSubmit: (url: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Import Habr article' });

        let urlValue = '';

        new Setting(contentEl).setName('Article URL').addText((text) =>
            text.setPlaceholder('https://habr.com/...').onChange((value) => {
                urlValue = value.trim();
            }),
        );

        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText('Download')
                .setCta()
                .onClick(() => {
                    if (!urlValue) {
                        new Notice('Please enter a URL.');
                        return;
                    }

                    this.close();
                    this.onSubmit(urlValue);
                }),
        );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export default class HabrImporterPlugin extends Plugin {
    settings: PluginSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new SettingsTab(this.app, this));

        this.addCommand({
            id: 'habr-importer-download',
            name: 'Import Habr article from URL',
            callback: () => {
                new UrlPromptModal(this.app, (url) => {
                    void this.importArticle(url);
                }).open();
            },
        });

        this.addCommand({
            id: 'habr-importer-archive',
            name: 'Archive current Habr article',
            callback: () => {
                const file = this.app.workspace.getActiveFile();
                if (!(file instanceof TFile)) {
                    new Notice('No active file to archive.');
                    return;
                }

                if (!this.isHabrArticle(file)) {
                    new Notice('Active file is not a Habr article.');
                    return;
                }

                void this.archiveArticle(file);
            },
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, defaultSettings, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async importArticle(urlInput: string) {
        let url: URL;

        try {
            url = new URL(urlInput);
        } catch (error) {
            new Notice('Invalid URL.');
            return;
        }

        if (!url.hostname.endsWith('habr.com')) {
            new Notice('Only habr.com links are supported.');
            return;
        }

        new Notice('Downloading article...');

        let html: string;
        try {
            const response = await requestUrl({ url: url.toString(), method: 'GET' });
            html = response.text;
        } catch (error) {
            console.error('Failed to download article', error);
            new Notice('Failed to download article.');
            return;
        }

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const articleEl =
            doc.querySelector('.article-body') ??
            doc.querySelector('article.tm-article-presenter__content') ??
            doc.querySelector('article') ??
            doc.querySelector('.tm-article-body') ??
            doc.querySelector('.article-formatted-body');

        if (!articleEl) {
            new Notice('Could not find article content.');
            return;
        }

        const meta = this.extractMeta(doc, url.toString());

        const targetFolder = this.settings.saveFolder.trim();
        const folderPath = normalizePath(targetFolder || '');
        const imagesFolderSetting = this.settings.imagesFolder.trim();
        const imagesFolderPath = normalizePath(imagesFolderSetting || 'Habr Images');

        const { markdown, downloads } = await this.prepareMarkdown(
            articleEl,
            meta,
            imagesFolderPath,
        );

        try {
            if (folderPath) {
                await this.ensureFolder(folderPath);
            }
        } catch (error) {
            console.error('Failed to create target folder', error);
            new Notice('Failed to create target folder.');
            return;
        }

        const baseName =
            this.sanitizeFileName(meta.title || 'Habr Article') || 'Habr Article';
        const filePath = await this.getUniquePath(
            normalizePath(folderPath ? `${folderPath}/${baseName}.md` : `${baseName}.md`),
        );

        try {
            await this.app.vault.create(filePath, markdown.trim());
        } catch (error) {
            console.error('Failed to save markdown file', error);
            new Notice('Failed to save markdown file.');
            return;
        }

        const createdFile = this.app.vault.getAbstractFileByPath(filePath);
        if (createdFile instanceof TFile) {
            await this.updateFrontmatter(createdFile, {
                source: meta.url,
                title: meta.title,
                published: meta.published,
            });
        }

        if (this.settings.openAfterImport) {
            if (createdFile instanceof TFile) {
                const leaf = this.app.workspace.getLeaf(true);
                await leaf.openFile(createdFile);
            }
        }

        if (downloads.length > 0) {
            try {
                await this.ensureFolder(imagesFolderPath);
            } catch (error) {
                console.error('Failed to create image folder', error);
                new Notice('Failed to create image folder.');
                return;
            }

            try {
                await this.downloadImages(downloads, imagesFolderPath);
            } catch (error) {
                console.error('Failed to download images', error);
                new Notice('Markdown saved, but images failed to download.');
                return;
            }
        }

        new Notice(`Saved: ${filePath}`);
    }

    private extractMeta(doc: Document, url: string): ArticleMeta {
        const title =
            doc
                .querySelector('meta[property="og:title"]')
                ?.getAttribute('content')
                ?.trim() ||
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

    private async prepareMarkdown(
        articleEl: Element,
        meta: ArticleMeta,
        imagesFolderPath: string,
    ) {
        this.cleanArticle(articleEl);

        const downloads: DownloadItem[] = [];
        const imageMap = new Map<string, string>();
        const baseUrl = new URL(meta.url);

        const images = Array.from(articleEl.querySelectorAll('img'));

        images.forEach((img, index) => {
            const src = this.resolveImageUrl(img, baseUrl);
            if (!src || src.startsWith('data:')) return;

            if (imageMap.has(src)) {
                const existingName = imageMap.get(src);
                const linkPath = this.encodePathForMarkdown(
                    `${imagesFolderPath}/${existingName}`,
                );
                img.setAttribute('src', linkPath);
                return;
            }

            const extension = this.getImageExtension(src) || 'jpg';
            const fileName = `${this.createUuid()}.${extension}`;
            const linkPath = this.encodePathForMarkdown(
                `${imagesFolderPath}/${fileName}`,
            );

            imageMap.set(src, fileName);
            img.setAttribute('src', linkPath);
            downloads.push({ url: src, path: fileName });
        });

        const turndown = new TurndownService({
            codeBlockStyle: 'fenced',
            fence: '```',
            headingStyle: 'atx',
            emDelimiter: '_',
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
                const language = this.extractCodeLanguage(className);

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
        return { markdown, downloads };
    }

    private async downloadImages(downloads: DownloadItem[], imageFolderPath: string) {
        let failed = false;

        for (const item of downloads) {
            const targetPath = normalizePath(`${imageFolderPath}/${item.path}`);

            try {
                const response = await requestUrl({ url: item.url, method: 'GET' });
                if (!response.arrayBuffer) {
                    throw new Error('No binary data');
                }

                await this.app.vault.adapter.writeBinary(
                    targetPath,
                    response.arrayBuffer,
                );
            } catch (error) {
                console.error(`Failed to download ${item.url}`, error);
                failed = true;
            }
        }
        if (failed) {
            throw new Error('Some images failed to download.');
        }
    }

    private cleanArticle(articleEl: Element) {
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

    private resolveImageUrl(img: HTMLImageElement, baseUrl: URL): string | null {
        const src =
            img.getAttribute('src') ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-original') ||
            this.pickFromSrcset(img.getAttribute('srcset'));

        if (!src) return null;
        if (src.startsWith('//')) return `https:${src}`;
        if (src.startsWith('/')) return `${baseUrl.origin}${src}`;

        try {
            return new URL(src, baseUrl.origin).toString();
        } catch (error) {
            return null;
        }
    }

    private pickFromSrcset(srcset: string | null) {
        if (!srcset) return null;
        const first = srcset.split(',')[0]?.trim();
        if (!first) return null;
        return first.split(' ')[0];
    }

    private getImageExtension(url: string) {
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

    private async ensureFolder(path: string) {
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing) return;

        const parts = path.split('/').filter(Boolean);
        let current = '';

        for (const part of parts) {
            current = normalizePath(current ? `${current}/${part}` : part);
            if (!this.app.vault.getAbstractFileByPath(current)) {
                await this.app.vault.createFolder(current);
            }
        }
    }

    private async getUniquePath(path: string) {
        if (!this.app.vault.getAbstractFileByPath(path)) {
            return path;
        }

        const extensionMatch = path.match(/\.[^./]+$/);
        const extension = extensionMatch ? extensionMatch[0] : '';
        const base = extension ? path.slice(0, -extension.length) : path;

        for (let index = 1; index < 1000; index += 1) {
            const candidate = `${base} (${index})${extension}`;
            if (!this.app.vault.getAbstractFileByPath(candidate)) {
                return candidate;
            }
        }

        return path;
    }

    private sanitizeFileName(name: string) {
        return name
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private createUuid() {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }

        const time = Date.now().toString(16);
        const random = Math.random().toString(16).slice(2);
        return `${time}-${random}`;
    }

    private encodePathForMarkdown(path: string) {
        return encodeURI(path);
    }

    private extractCodeLanguage(className: string) {
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

    private isHabrArticle(file: TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        const source = cache?.frontmatter?.source;

        return (
            typeof source === 'string' &&
            (source.includes('habr.com') || source.includes('habr.ru'))
        );
    }

    private async archiveArticle(file: TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        const archivedValue = cache?.frontmatter?.archived;

        if (archivedValue) {
            new Notice('Article already archived.');
            return;
        }

        const parent = file.parent?.path ?? '';
        const archivePath = normalizePath(parent ? `${parent}/Archive` : 'Archive');

        try {
            await this.ensureFolder(archivePath);
        } catch (error) {
            console.error('Failed to create Archive folder', error);
            new Notice('Failed to create Archive folder.');
            return;
        }

        const targetPath = await this.getUniquePath(
            normalizePath(`${archivePath}/${file.name}`),
        );

        try {
            await this.app.vault.rename(file, targetPath);
        } catch (error) {
            console.error('Failed to move file to Archive', error);
            new Notice('Failed to archive article.');
            return;
        }

        const movedFile = this.app.vault.getAbstractFileByPath(targetPath);
        if (movedFile instanceof TFile) {
            await this.updateFrontmatter(movedFile, {
                archived: moment().toDate(),
            });
        }

        new Notice('Article archived.');
    }

    private async updateFrontmatter(
        file: TFile,
        data: {
            source?: string;
            title?: string;
            published?: string;
            archived?: Date;
        },
    ) {
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            if (data.source) {
                frontmatter.source = data.source;
            }

            if (data.title) {
                frontmatter.title = data.title;
            }

            if (data.published) {
                const published = moment(data.published);
                if (published.isValid()) {
                    frontmatter.published = published.toDate();
                }
            }

            if (data.archived) {
                frontmatter.archived = data.archived;
            }
        });
    }
}
