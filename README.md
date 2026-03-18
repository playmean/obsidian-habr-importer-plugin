# Habr Importer

Плагин для Obsidian, который скачивает статьи с habr.com, конвертирует в Markdown и сохраняет в vault. Изображения сохраняются в отдельную папку vault.

## Возможности

- Импорт статьи по ссылке на Habr
- Обновление текущей статьи по ссылке из frontmatter
- Скачивание изображений в отдельную папку vault
- Хеш-имена файлов изображений (без перезаписи совпадающих)
- Автооткрытие статьи после импорта (настраивается)
- Архивация статьи в подпапку `Archive` + запись даты/времени в frontmatter

## Использование

1. Откройте командную палитру и выберите `Habr Importer: Import Habr article from URL`.
2. Вставьте ссылку на статью.
3. Плагин создаст md-файл и сохранит изображения в указанной папке для картинок.
4. Для обновления существующей статьи используйте `Habr Importer: Update current Habr article`.
5. При необходимости используйте команду `Habr Importer: Archive current Habr article` для архивации статьи в подпапку `Archive`.

## Frontmatter

Плагин добавляет следующие поля:

- `source`: ссылка на статью
- `title`: заголовок статьи
- `published`: дата и время публикации (если доступно)
- `archived`: дата и время архивации (при архивировании)

## Ручная установка плагина (пока не опубликуется в community plugins)

1. Перейдите в настройки Obsidian -> Community plugins и убедитесь, что у вас выключена опция Restricted mode, а кнопка Community plugins открывает список плагинов
2. Скачайте плагин в разделе [Releases](https://github.com/playmean/obsidian-habr-importer-plugin/releases)
3. Перейдите в каталог с плагинами Obsidian в вашем Vault (например, `/Users/user/obsidian/.obsidian/plugins`); если каталога `plugins` нет, создайте
4. Создайте внутри каталога с плагинами новый каталог `habr-importer` и переместите туда файлы `main.js` и `manifest.json` из архива выше
5. Перезапустите Obsidian и зайдите в настройки -> Community plugins, в разделе Installed plugins должен появиться `Habr Importer`

## Настройки (кнопка ⚙️ в Community plugins -> Habr Importer)

- **Target folder**: путь в vault, куда сохраняются статьи (например `Habr`).
- **Images folder**: путь в vault, куда сохраняются изображения (например `Habr Images`).
- **Open after import**: автоматически открывать статью после импорта.

