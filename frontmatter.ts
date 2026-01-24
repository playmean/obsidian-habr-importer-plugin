import type { App, TFile } from 'obsidian';
import { moment } from 'obsidian';
import type { FrontmatterUpdate } from './types';

export function isHabrArticle(app: App, file: TFile) {
    const cache = app.metadataCache.getFileCache(file);
    const source = cache?.frontmatter?.source;

    return (
        typeof source === 'string' &&
        (source.includes('habr.com') || source.includes('habr.ru'))
    );
}

export async function updateFrontmatter(app: App, file: TFile, data: FrontmatterUpdate) {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
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
