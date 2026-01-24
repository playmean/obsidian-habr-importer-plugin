import { App, PluginSettingTab, Setting } from 'obsidian';

import HabrImporterPlugin from './main';

export class SettingsTab extends PluginSettingTab {
    plugin: HabrImporterPlugin;

    constructor(app: App, plugin: HabrImporterPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Target folder')
            .setDesc('Vault folder where Markdown files will be saved.')
            .addText((text) =>
                text
                    .setPlaceholder('Habr')
                    .setValue(this.plugin.settings.saveFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.saveFolder = value.trim();
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Images folder')
            .setDesc('Vault folder where images will be stored.')
            .addText((text) =>
                text
                    .setPlaceholder('Habr Images')
                    .setValue(this.plugin.settings.imagesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.imagesFolder = value.trim();
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Open after import')
            .setDesc('Automatically open the imported article.')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.openAfterImport)
                    .onChange(async (value) => {
                        this.plugin.settings.openAfterImport = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
