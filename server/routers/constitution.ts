/**
 * Community Constitution Router — read-only.
 *
 *   GET /api/communities/:id/constitution           JSON (for the tab)
 *   GET /api/communities/:id/constitution.md        Markdown download
 *   GET /api/communities/:id/constitution.html      Print-ready HTML download
 *
 * All three take ?lang=el|en (default el); the downloads also take
 * ?version=ai|raw (default ai — the AI-drafted articles; raw = original texts). The rules part is always public
 * (it restates the community row, which is public); the decisions part
 * follows the community's contentVisibility — see utils/constitution.ts.
 */

import type { Express } from 'express';
import { buildConstitution, layout, renderHtml, renderMarkdown, type Lang, type Version } from '../utils/constitution';
import { logger } from '../utils/logger';

function origin(req: any): string {
  return (process.env.APP_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function fileBase(name: string, id: number): string {
  const slug = name.normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `constitution-${slug || id}`;
}

export function registerConstitutionRoutes(app: Express): void {
  app.get(/^\/api\/communities\/(\d+)\/constitution(?:\.(md|html))?$/, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params[0], 10);
      const format: 'json' | 'md' | 'html' = req.params[1] ?? 'json';
      const lang: Lang = req.query?.lang === 'en' ? 'en' : 'el';
      const version: Version = req.query?.version === 'raw' ? 'raw' : 'ai';

      const doc = await buildConstitution(communityId, req.user?.id, lang);
      if (!doc) return res.status(404).json({ message: 'community not found' });

      res.setHeader('Cache-Control', 'no-store');
      if (format === 'json') {
        return res.json({
          ...doc,
          layouts: { raw: layout(doc, 'raw'), ai: doc.ai?.available ? layout(doc, 'ai') : null },
        });
      }

      const base = fileBase(doc.communityName, doc.communityId) + (version === 'raw' ? '-original' : '');
      const body = format === 'md' ? renderMarkdown(doc, version, origin(req)) : renderHtml(doc, version, origin(req));
      res.setHeader('Content-Type', format === 'md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition',
        `attachment; filename="${base.replace(/[^\x20-\x7e]/g, '_')}.${format}"; filename*=UTF-8''${encodeURIComponent(base)}.${format}`);
      res.send(body);
    } catch (err: any) {
      logger.error('constitution build failed', { err: err?.message });
      res.status(500).json({ message: 'Failed to build constitution' });
    }
  });
}
