export interface ArticleMeta {
    title: string;
    author?: string;
    published?: string;
    url: string;
}

export interface EnsureImagesNotices {
    folderFailureNotice: string;
    downloadFailureNotice: string;
}

export interface FrontmatterUpdate {
    source?: string;
    title?: string;
    published?: string;
    archived?: Date;
}
