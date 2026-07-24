import { db } from './db';

/**
 * Single write path for article progress, shared by the article view, the
 * library's inline read toggle and the book chapter view (book chapters use
 * string keys — see lib/books.ts). Any touch counts as "opened" for recency.
 */
export async function upsertArticleProgress(
  articleId: number | string,
  patch: Partial<{ read: 0 | 1; position: number }>,
): Promise<void> {
  const now = Date.now();
  const existing = await db.articleProgress.get(articleId);
  await db.articleProgress.put({
    articleId,
    read: patch.read ?? existing?.read ?? 0,
    position: patch.position ?? existing?.position ?? 0,
    lastOpenedAt: now,
    updatedAt: now,
  });
}

/** Toggle helper for the library cards (matches the article view's action). */
export async function setArticleRead(articleId: number | string, read: boolean): Promise<void> {
  await upsertArticleProgress(articleId, { read: read ? 1 : 0 });
}
