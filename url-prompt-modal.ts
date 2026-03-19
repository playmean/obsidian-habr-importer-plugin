import { Modal, Notice, Setting, type App } from 'obsidian';

export class UrlPromptModal extends Modal {
    private onSubmit: (url: string) => void;

    constructor(app: App, onSubmit: (url: string) => void) {
        super(app);

        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Import article' });

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
