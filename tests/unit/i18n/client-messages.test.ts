import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import {
  CLIENT_MESSAGE_NAMESPACES,
  DEAL_PAGE_MESSAGE_NAMESPACES,
  pickMessages,
} from '@/i18n/client-messages';

const ALL_SENT = [...CLIENT_MESSAGE_NAMESPACES, ...DEAL_PAGE_MESSAGE_NAMESPACES];
const DEAL_COMPONENTS = path.join('src', 'components', 'deals');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('client messages (NFR-1)', () => {
  it('keeps only the asked-for paths, with their nesting', () => {
    const messages = { a: { b: { c: 'x', d: 'y' }, e: 'z' }, f: 'w' };

    expect(pickMessages(messages, ['a.b.c', 'f', 'a.missing', 'nope'])).toEqual({
      a: { b: { c: 'x' } },
      f: 'w',
    });
  });

  it('covers every namespace a component asks for with useTranslations', () => {
    const used = new Set(
      sourceFiles(path.resolve('src')).flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/useTranslations\('([\w.]+)'\)/g)].map(
          (match) => match[1] ?? '',
        ),
      ),
    );
    const isCovered = (namespace: string) =>
      ALL_SENT.some((sent) => namespace === sent || namespace.startsWith(`${sent}.`));

    expect([...used].filter((namespace) => !isCovered(namespace))).toEqual([]);
  });

  it('deal-page namespaces are used only by the deal components', () => {
    const outside = sourceFiles(path.resolve('src'))
      .filter((file) => !file.includes(DEAL_COMPONENTS))
      .filter((file) =>
        DEAL_PAGE_MESSAGE_NAMESPACES.some((namespace) =>
          readFileSync(file, 'utf8').includes(`useTranslations('${namespace}`),
        ),
      );

    expect(outside).toEqual([]);
  });

  it('every listed namespace exists in the English messages', () => {
    const picked = pickMessages(en, ALL_SENT);
    for (const namespace of ALL_SENT) {
      const value = namespace
        .split('.')
        .reduce<unknown>(
          (node, key) =>
            typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined,
          picked,
        );
      expect(value, namespace).toBeDefined();
    }
  });
});
