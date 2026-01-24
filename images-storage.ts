import type { App, TFile } from 'obsidian';
import { normalizePath, Notice } from 'obsidian';
import type { EnsureImagesNotices } from './types';
import {
    fetchImageData,
    getImageExtension,
    getImageExtensionFromMimeType,
    hashArrayBuffer,
} from './image-utils';
import { encodePathForMarkdown } from './text-utils';
import { ensureFolder } from './vault-utils';

async function downloadImages(app: App, imageUrls: string[], imageFolderPath: string) {
    const urlToPath = new Map<string, string>();
    const hashToName = new Map<string, string>();

    let failed = false;

    for (const url of imageUrls) {
        try {
            const imageResponse = await fetchImageData(url);

            if (!imageResponse) {
                failed = true;

                continue;
            }

            const hash = await hashArrayBuffer(imageResponse.data);

            let fileName = hashToName.get(hash);

            if (!fileName) {
                const extension =
                    getImageExtensionFromMimeType(imageResponse.mimeType) ||
                    getImageExtension(url) ||
                    'jpg';

                fileName = `${hash}.${extension}`;

                hashToName.set(hash, fileName);
            }

            const targetPath = normalizePath(`${imageFolderPath}/${fileName}`);

            if (!app.vault.getAbstractFileByPath(targetPath)) {
                await app.vault.adapter.writeBinary(targetPath, imageResponse.data);
            }

            urlToPath.set(url, encodePathForMarkdown(`${imageFolderPath}/${fileName}`));
        } catch (error) {
            console.error(`Failed to download ${url}`, error);

            failed = true;
        }
    }

    if (failed) {
        throw new Error('Some images failed to download.');
    }

    return urlToPath;
}

export async function ensureImages(
    app: App,
    file: TFile,
    imageUrls: string[],
    imagesFolderPath: string,
    notices: EnsureImagesNotices,
) {
    if (imageUrls.length === 0) return true;

    try {
        await ensureFolder(app, imagesFolderPath);
    } catch (error) {
        console.error('Failed to create image folder', error);

        new Notice(notices.folderFailureNotice);

        return false;
    }

    try {
        const urlToPath = await downloadImages(app, imageUrls, imagesFolderPath);
        if (urlToPath.size > 0) {
            const content = await app.vault.read(file);

            let updated = content;

            for (const [url, path] of urlToPath.entries()) {
                updated = updated.split(url).join(path);
            }

            if (updated !== content) {
                await app.vault.modify(file, updated);
            }
        }
    } catch (error) {
        console.error('Failed to download images', error);

        new Notice(notices.downloadFailureNotice);

        return false;
    }

    return true;
}
