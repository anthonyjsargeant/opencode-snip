// @ts-check
import js from '@eslint/js';
import {defineConfig} from 'eslint/config';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';

export default defineConfig(
    js.configs.recommended,
    tseslint.configs.recommended,
    prettier,

    {
        rules: {
            quotes: ['error', 'single'],
            semi: ['error', 'always'],
        }
    },

    {
        ignores: [
            'node_modules/',
            'dist/',
            'coverage/',
        ],
    },

    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },

    {
        files: ['**/*.test.ts'],
        plugins: {
            vitest,
        },
        rules: {
            ...vitest.configs.recommended.rules,
        },
        languageOptions: {
            globals: {
                ...vitest.environments.env.globals,
            },
        },
    }
);
