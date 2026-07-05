import { db } from './db';

/**
 * Single write path for article progress, shared by the article view and the
 * library's inline read toggle. Any touch counts as "opened" for recency.
 */
export async function upsertArticleProgress(
  articleId: number,
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
export async function setArticleRead(articleId: number, read: boolean): Promise<void> {
  await upsertArticleProgress(articleId, { read: read ? 1 : 0 });
}
