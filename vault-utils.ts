import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';

export async function ensureFolder(app: App, path: string) {
    const existing = app.vault.getAbstractFileByPath(path);

    if (existing) return;

    const parts = path.split('/').filter(Boolean);

    let current = '';

    for (const part of parts) {
        current = normalizePath(current ? `${current}/${part}` : part);

        if (!app.vault.getAbstractFileByPath(current)) {
            await app.vault.createFolder(current);
        }
    }
}

export function getUniquePath(app: App, path: string) {
    if (!app.vault.getAbstractFileByPath(path)) {
        return path;
    }

    const extensionMatch = path.match(/\.[^./]+$/);
    const extension = extensionMatch ? extensionMatch[0] : '';
    const base = extension ? path.slice(0, -extension.length) : path;

    for (let index = 1; index < 1000; index += 1) {
        const candidate = `${base} (${index})${extension}`;

        if (!app.vault.getAbstractFileByPath(candidate)) {
            return candidate;
        }
    }

    return path;
}
