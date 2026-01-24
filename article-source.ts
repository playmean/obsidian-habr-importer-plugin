import { requestUrl } from 'obsidian';

export async function downloadHtml(url: string) {
    const response = await requestUrl({ url, method: 'GET' });

    return response.text;
}
