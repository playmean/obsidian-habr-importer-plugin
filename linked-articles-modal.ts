import { Modal, Setting, type App } from 'obsidian';

export interface LinkedArticleOption {
    articleId: string;
    url: string;
    label?: string;
}

export class LinkedArticlesModal extends Modal {
    private options: LinkedArticleOption[];
    private onSubmit: (selectedArticleIds: string[]) => void;
    private onCancel: () => void;
    private selectedIds: Set<string>;
    private submitted = false;

    constructor(
        app: App,
        options: LinkedArticleOption[],
        onSubmit: (selectedArticleIds: string[]) => void,
        onCancel: () => void,
    ) {
        super(app);

        this.options = options;
        this.onSubmit = onSubmit;
        this.onCancel = onCancel;
        this.selectedIds = new Set(options.map((option) => option.articleId));
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Import linked articles' });
        contentEl.createEl('p', { text: 'Select linked articles to import.' });

        this.options.forEach((option) => {
            new Setting(contentEl)
                .setName(this.getOptionName(option))
                .setDesc(option.url)
                .addToggle((toggle) =>
                    toggle.setValue(true).onChange((value) => {
                        if (value) {
                            this.selectedIds.add(option.articleId);

                            return;
                        }

                        this.selectedIds.delete(option.articleId);
                    }),
                );
        });

        new Setting(contentEl)
            .addButton((button) =>
                button
                    .setButtonText('Import selected')
                    .setCta()
                    .onClick(() => {
                        this.submitted = true;
                        this.close();
                        this.onSubmit([...this.selectedIds]);
                    }),
            )
            .addButton((button) =>
                button.setButtonText('Cancel').onClick(() => {
                    this.close();
                }),
            );
    }

    onClose() {
        this.contentEl.empty();

        if (!this.submitted) {
            this.onCancel();
        }
    }

    private getOptionName(option: LinkedArticleOption) {
        const normalizedLabel = option.label?.trim();

        if (normalizedLabel) {
            return normalizedLabel;
        }

        return `Article ${option.articleId}`;
    }
}
