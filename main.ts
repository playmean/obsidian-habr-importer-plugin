import { Notice, Plugin, TFile, normalizePath } from 'obsidian';

import { SettingsTab } from './settings-tab';
import { archiveArticle } from './archive';
import { extractMeta, findArticleElement } from './article-dom';
import { downloadHtml } from './article-source';
import { isHabrArticle, updateFrontmatter } from './frontmatter';
import { ensureImages } from './images-storage';
import { type LinkedArticleOption, LinkedArticlesModal } from './linked-articles-modal';
import { prepareMarkdown } from './markdown';
import { sanitizeFileName } from './text-utils';
import { ensureFolder, getUniquePath } from './vault-utils';
import { UrlPromptModal } from './url-prompt-modal';

interface PluginSettings {
    saveFolder: string;
    imagesFolder: string;
    openAfterImport: boolean;
}

interface ImportArticleOptions {
    openAfterImport?: boolean;
    reuseExistingBySource?: boolean;
    suppressSuccessNotice?: boolean;
}

interface ArticleLinkMatch {
    start: number;
    end: number;
    url: string;
    label?: string;
}

const defaultSettings: PluginSettings = {
    saveFolder: 'Habr',
    imagesFolder: 'Habr Images',
    openAfterImport: true,
};

export default class HabrImporterPlugin extends Plugin {
    settings: PluginSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new SettingsTab(this.app, this));

        this.addCommand({
            id: 'download-article',
            name: 'Import article from link',
            callback: () => {
                new UrlPromptModal(this.app, (url) => {
                    void this.importArticle(url);
                }).open();
            },
        });

        this.addCommand({
            id: 'archive-article',
            name: 'Archive current article',
            callback: () => {
                const file = this.app.workspace.getActiveFile();
                if (!(file instanceof TFile)) {
                    new Notice('No active file to archive.');

                    return;
                }

                if (!isHabrArticle(this.app, file)) {
                    new Notice('Active file is not a habr article.');

                    return;
                }

                void archiveArticle(this.app, file);
            },
        });

        this.addCommand({
            id: 'update-article',
            name: 'Update current habr article',
            callback: () => {
                const file = this.app.workspace.getActiveFile();

                if (!(file instanceof TFile)) {
                    new Notice('No active file to update.');

                    return;
                }

                if (!isHabrArticle(this.app, file)) {
                    new Notice('Active file is not a habr article.');

                    return;
                }

                void this.updateArticle(file);
            },
        });

        this.addCommand({
            id: 'download-linked-articles',
            name: 'Import linked articles from current article',
            callback: () => {
                const file = this.app.workspace.getActiveFile();

                if (!(file instanceof TFile)) {
                    new Notice('No active file to process.');

                    return;
                }

                if (!isHabrArticle(this.app, file)) {
                    new Notice('Active file is not a habr article.');

                    return;
                }

                void this.importLinksFromCurrentArticle(file);
            },
        });
    }

    async loadSettings() {
        const loaded = (await this.loadData()) as Partial<PluginSettings> | null;

        this.settings = Object.assign({}, defaultSettings, loaded ?? {});
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async importArticle(
        urlInput: string,
        options: ImportArticleOptions = {},
    ): Promise<TFile | null> {
        let url: URL;

        try {
            url = new URL(urlInput);
        } catch {
            new Notice('Invalid URL.');

            return null;
        }

        if (!this.isHabrHost(url.hostname)) {
            new Notice('Only habr article links are supported.');

            return null;
        }

        const articleId = this.extractArticleIdFromUrl(url.toString());

        if (options.reuseExistingBySource && articleId) {
            const existing = this.findImportedArticleById(articleId);

            if (existing) {
                return existing;
            }
        }

        new Notice('Downloading article...');

        const parsed = await this.fetchArticle(url.toString());

        if (!parsed) return null;

        const targetFolder = this.settings.saveFolder.trim();
        const folderPath = normalizePath(targetFolder || '');
        const imagesFolderPath = this.getImagesFolderPath();

        const { markdown, imageUrls, meta } = parsed;

        try {
            if (folderPath) {
                await ensureFolder(this.app, folderPath);
            }
        } catch (error) {
            console.error('Failed to create target folder', error);

            new Notice('Failed to create target folder.');

            return null;
        }

        const baseName = sanitizeFileName(meta.title || 'Habr Article') || 'Habr Article';
        const filePath = getUniquePath(
            this.app,
            normalizePath(folderPath ? `${folderPath}/${baseName}.md` : `${baseName}.md`),
        );

        try {
            await this.app.vault.create(filePath, markdown.trim());
        } catch (error) {
            console.error('Failed to save markdown file', error);

            new Notice('Failed to save Markdown file.');

            return null;
        }

        const createdFile = this.app.vault.getAbstractFileByPath(filePath);

        if (createdFile instanceof TFile) {
            await updateFrontmatter(this.app, createdFile, {
                source: meta.url,
                title: meta.title,
                published: meta.published,
            });
        }

        const shouldOpenAfterImport =
            options.openAfterImport ?? this.settings.openAfterImport;

        if (shouldOpenAfterImport) {
            if (createdFile instanceof TFile) {
                const leaf = this.app.workspace.getLeaf(true);

                await leaf.openFile(createdFile);
            }
        }

        if (createdFile instanceof TFile) {
            const imagesResult = await ensureImages(
                this.app,
                createdFile,
                imageUrls,
                imagesFolderPath,
                {
                    folderFailureNotice: 'Failed to create image folder.',
                    downloadFailureNotice:
                        'Markdown saved, but images failed to download.',
                },
            );

            if (!imagesResult) return null;
        }

        if (!options.suppressSuccessNotice) {
            new Notice(`Saved: ${filePath}`);
        }

        return createdFile instanceof TFile ? createdFile : null;
    }

    private async updateArticle(file: TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        const source = frontmatter?.source;

        if (typeof source !== 'string' || !source.trim()) {
            new Notice('No source URL in frontmatter.');

            return;
        }

        let url: URL;

        try {
            url = new URL(source);
        } catch {
            new Notice('Invalid source URL in frontmatter.');

            return;
        }

        new Notice('Downloading article update...');

        const parsed = await this.fetchArticle(url.toString());

        if (!parsed) return;

        const imagesFolderPath = this.getImagesFolderPath();

        const { markdown, imageUrls, meta } = parsed;

        try {
            await this.app.vault.modify(file, markdown.trim());
        } catch (error) {
            console.error('Failed to update markdown file', error);

            new Notice('Failed to update Markdown file.');

            return;
        }

        await updateFrontmatter(this.app, file, {
            source: meta.url,
            title: meta.title,
            published: meta.published,
        });

        const imagesResult = await ensureImages(
            this.app,
            file,
            imageUrls,
            imagesFolderPath,
            {
                folderFailureNotice: 'File updated, but images folder missing.',
                downloadFailureNotice: 'File updated, but images failed to download.',
            },
        );

        if (!imagesResult) return;

        new Notice('Article updated.');
    }

    private async fetchArticle(url: string) {
        let html: string;

        try {
            html = await downloadHtml(url);
        } catch (error) {
            console.error('Failed to download article', error);

            new Notice('Failed to download article.');

            return null;
        }

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const articleEl = findArticleElement(doc);

        if (!articleEl) {
            new Notice('Could not find article content.');

            return null;
        }

        const meta = extractMeta(doc, url);
        const { markdown, imageUrls } = prepareMarkdown(articleEl, meta);

        return {
            markdown,
            imageUrls,
            meta,
        };
    }

    private getImagesFolderPath() {
        const imagesFolderSetting = this.settings.imagesFolder.trim();

        return normalizePath(imagesFolderSetting || 'Habr Images');
    }

    private async importLinksFromCurrentArticle(file: TFile) {
        let content: string;

        try {
            content = await this.app.vault.read(file);
        } catch (error) {
            console.error('Failed to read current file', error);
            new Notice('Failed to read current file.');

            return;
        }

        const matches = this.extractLinkedArticles(content);

        if (matches.length === 0) {
            new Notice('No linked habr articles found.');

            return;
        }

        const sourceId = this.getSourceArticleId(file);
        const firstLinkByArticleId = new Map<string, LinkedArticleOption>();

        matches.forEach((match) => {
            const articleId = this.extractArticleIdFromUrl(match.url);

            if (!articleId || articleId === sourceId) {
                return;
            }

            if (!firstLinkByArticleId.has(articleId)) {
                firstLinkByArticleId.set(articleId, {
                    articleId,
                    url: match.url,
                    label: match.label,
                });
            }
        });

        if (firstLinkByArticleId.size === 0) {
            new Notice('No linked habr articles found.');

            return;
        }

        const selectedArticleIds = await this.pickLinkedArticlesForImport([
            ...firstLinkByArticleId.values(),
        ]);

        if (!selectedArticleIds) {
            return;
        }

        if (selectedArticleIds.size === 0) {
            new Notice('No linked articles selected.');

            return;
        }

        const fileByArticleId = new Map<string, TFile>();
        const newlyImportedFiles: TFile[] = [];
        let importedCount = 0;
        let failedCount = 0;

        for (const [articleId, option] of firstLinkByArticleId) {
            if (!selectedArticleIds.has(articleId)) {
                continue;
            }

            const existing = this.findImportedArticleById(articleId);

            if (existing) {
                fileByArticleId.set(articleId, existing);

                continue;
            }

            const imported = await this.importArticle(option.url, {
                openAfterImport: false,
                reuseExistingBySource: true,
                suppressSuccessNotice: true,
            });

            if (!imported) {
                failedCount += 1;

                continue;
            }

            fileByArticleId.set(articleId, imported);
            newlyImportedFiles.push(imported);
            importedCount += 1;
        }

        for (const importedFile of newlyImportedFiles) {
            await this.replaceKnownArticleLinks(importedFile);
        }

        let updatedContent = content;

        for (const match of [...matches].reverse()) {
            const articleId = this.extractArticleIdFromUrl(match.url);

            if (!articleId) {
                continue;
            }

            const linkedFile = fileByArticleId.get(articleId);

            if (!linkedFile) {
                continue;
            }

            const replacement = this.buildWikiLink(linkedFile.basename, match.label);

            updatedContent =
                updatedContent.slice(0, match.start) +
                replacement +
                updatedContent.slice(match.end);
        }

        if (updatedContent !== content) {
            try {
                await this.app.vault.modify(file, updatedContent);
            } catch (error) {
                console.error('Failed to update links in current file', error);
                new Notice(
                    `Imported ${importedCount} linked articles, but failed to update links.`,
                );

                return;
            }
        }

        const linkedCount = fileByArticleId.size;

        if (failedCount > 0) {
            new Notice(
                `Linked articles processed: ${linkedCount}, imported: ${importedCount}, failed: ${failedCount}.`,
            );

            return;
        }

        new Notice(
            `Linked articles processed: ${linkedCount}, imported: ${importedCount}.`,
        );
    }

    private isHabrHost(hostname: string) {
        return (
            hostname.endsWith('habr.com') ||
            hostname.endsWith('habr.ru') ||
            hostname.endsWith('habrahabr.ru')
        );
    }

    private extractArticleIdFromUrl(urlInput: string) {
        let url: URL;

        try {
            url = new URL(urlInput);
        } catch {
            return null;
        }

        if (!this.isHabrHost(url.hostname)) {
            return null;
        }

        const path = url.pathname.toLowerCase();
        const match = path.match(
            /\/(?:(?:ru|en)\/)?(?:companies\/[^/]+\/)?(?:articles|post)\/(\d+)(?:\/|$)/,
        );

        return match?.[1] ?? null;
    }

    private findImportedArticleById(articleId: string) {
        for (const file of this.app.vault.getMarkdownFiles()) {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            const source = frontmatter?.source;

            if (typeof source !== 'string') {
                continue;
            }

            if (this.extractArticleIdFromUrl(source) === articleId) {
                return file;
            }
        }

        return null;
    }

    private getSourceArticleId(file: TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        const source = frontmatter?.source;

        if (typeof source !== 'string') {
            return null;
        }

        return this.extractArticleIdFromUrl(source);
    }

    private extractLinkedArticles(content: string): ArticleLinkMatch[] {
        const matches: ArticleLinkMatch[] = [];
        const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        const autoLinkRegex = /<(https?:\/\/[^>\s]+)>/g;

        for (const match of content.matchAll(markdownLinkRegex)) {
            const fullMatch = match[0];
            const label = match[1];
            const url = match[2];
            const index = match.index;

            if (typeof index !== 'number') {
                continue;
            }

            if (!this.extractArticleIdFromUrl(url)) {
                continue;
            }

            matches.push({
                start: index,
                end: index + fullMatch.length,
                url,
                label,
            });
        }

        for (const match of content.matchAll(autoLinkRegex)) {
            const fullMatch = match[0];
            const url = match[1];
            const index = match.index;

            if (typeof index !== 'number') {
                continue;
            }

            if (!this.extractArticleIdFromUrl(url)) {
                continue;
            }

            matches.push({
                start: index,
                end: index + fullMatch.length,
                url,
            });
        }

        return matches.sort((a, b) => a.start - b.start);
    }

    private buildWikiLink(target: string, label?: string) {
        const normalizedLabel = label?.trim();

        if (!normalizedLabel || normalizedLabel === target) {
            return `[[${target}]]`;
        }

        return `[[${target}|${normalizedLabel}]]`;
    }

    private async replaceKnownArticleLinks(file: TFile) {
        let content: string;

        try {
            content = await this.app.vault.read(file);
        } catch (error) {
            console.error('Failed to read linked article file', error);

            return false;
        }

        const matches = this.extractLinkedArticles(content);

        if (matches.length === 0) {
            return false;
        }

        let updatedContent = content;

        for (const match of [...matches].reverse()) {
            const articleId = this.extractArticleIdFromUrl(match.url);

            if (!articleId) {
                continue;
            }

            const linkedFile = this.findImportedArticleById(articleId);

            if (!linkedFile || linkedFile.path === file.path) {
                continue;
            }

            const replacement = this.buildWikiLink(linkedFile.basename, match.label);

            updatedContent =
                updatedContent.slice(0, match.start) +
                replacement +
                updatedContent.slice(match.end);
        }

        if (updatedContent === content) {
            return false;
        }

        try {
            await this.app.vault.modify(file, updatedContent);
        } catch (error) {
            console.error('Failed to replace links in linked article file', error);

            return false;
        }

        return true;
    }

    private async pickLinkedArticlesForImport(options: LinkedArticleOption[]) {
        return await new Promise<Set<string> | null>((resolve) => {
            new LinkedArticlesModal(
                this.app,
                options,
                (selectedArticleIds) => {
                    resolve(new Set(selectedArticleIds));
                },
                () => {
                    resolve(null);
                },
            ).open();
        });
    }
}
