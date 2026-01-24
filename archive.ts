import { Notice, moment, normalizePath, TFile, type App } from 'obsidian';
import { ensureFolder, getUniquePath } from './vault-utils';
import { updateFrontmatter } from './frontmatter';

export async function archiveArticle(app: App, file: TFile) {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
    const archivedValue = frontmatter?.archived;

    if (archivedValue) {
        new Notice('Article already archived.');

        return false;
    }

    const parent = file.parent?.path ?? '';
    const archivePath = normalizePath(parent ? `${parent}/Archive` : 'Archive');

    try {
        await ensureFolder(app, archivePath);
    } catch (error) {
        console.error('Failed to create archive folder', error);

        new Notice('Failed to create archive folder.');

        return false;
    }

    const targetPath = await getUniquePath(
        app,
        normalizePath(`${archivePath}/${file.name}`),
    );

    try {
        await app.vault.rename(file, targetPath);
    } catch (error) {
        console.error('Failed to move file to archive', error);

        new Notice('Failed to archive article.');

        return false;
    }

    const movedFile = app.vault.getAbstractFileByPath(targetPath);

    if (movedFile instanceof TFile) {
        await updateFrontmatter(app, movedFile, {
            archived: moment().toDate(),
        });
    }

    new Notice('Article archived.');

    return true;
}
