import { Notice, Plugin, TFile, normalizePath } from 'obsidian';

import { SettingsTab } from './settings-tab';
import { archiveArticle } from './archive';
import { extractMeta, findArticleElement } from './article-dom';
import { downloadHtml } from './article-source';
import { isHabrArticle, updateFrontmatter } from './frontmatter';
import { ensureImages } from './images-storage';
import { prepareMarkdown } from './markdown';
import { sanitizeFileName } from './text-utils';
import { ensureFolder, getUniquePath } from './vault-utils';
import { UrlPromptModal } from './url-prompt-modal';

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

                if (!isHabrArticle(this.app, file)) {
                    new Notice('Active file is not a Habr article.');

                    return;
                }

                void archiveArticle(this.app, file);
            },
        });

        this.addCommand({
            id: 'habr-importer-update',
            name: 'Update current Habr article',
            callback: () => {
                const file = this.app.workspace.getActiveFile();

                if (!(file instanceof TFile)) {
                    new Notice('No active file to update.');

                    return;
                }

                if (!isHabrArticle(this.app, file)) {
                    new Notice('Active file is not a Habr article.');

                    return;
                }

                void this.updateArticle(file);
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

        const parsed = await this.fetchArticle(url.toString());

        if (!parsed) return;

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

            return;
        }

        const baseName = sanitizeFileName(meta.title || 'Habr Article') || 'Habr Article';
        const filePath = await getUniquePath(
            this.app,
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
            await updateFrontmatter(this.app, createdFile, {
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

            if (!imagesResult) return;
        }

        new Notice(`Saved: ${filePath}`);
    }

    private async updateArticle(file: TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        const source = cache?.frontmatter?.source;

        if (typeof source !== 'string' || !source.trim()) {
            new Notice('No source URL in frontmatter.');

            return;
        }

        let url: URL;

        try {
            url = new URL(source);
        } catch (error) {
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

            new Notice('Failed to update markdown file.');

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
}
