import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
    {
        ignores: ['main.js'],
    },
    ...obsidianmd.configs.recommended,
    {
        plugins: {
            obsidianmd,
        },
        rules: {
            'obsidianmd/ui/sentence-case': [
                'error',
                {
                    brands: ['Habr'],
                    acronyms: ['URL'],
                },
            ],
        },
    },
    {
        languageOptions: {
            globals: globals.node,
            sourceType: 'module',
        },
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
                sourceType: 'module',
            },
        },
        ignores: ['node_modules', 'main.js'],
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
            '@typescript-eslint/ban-ts-comment': 'off',
            'no-prototype-builtins': 'off',
            '@typescript-eslint/no-empty-function': 'off',
        },
    },
]);
