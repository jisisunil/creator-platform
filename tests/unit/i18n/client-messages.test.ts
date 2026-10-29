import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import { CLIENT_MESSAGE_NAMESPACES, pickMessages } from '@/i18n/client-messages';

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
      CLIENT_MESSAGE_NAMESPACES.some(
        (sent) => namespace === sent || namespace.startsWith(`${sent}.`),
      );

    expect([...used].filter((namespace) => !isCovered(namespace))).toEqual([]);
  });

  it('every listed namespace exists in the English messages', () => {
    const picked = pickMessages(en, CLIENT_MESSAGE_NAMESPACES);
    for (const namespace of CLIENT_MESSAGE_NAMESPACES) {
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
