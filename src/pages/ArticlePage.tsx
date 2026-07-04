import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getArticle } from '../data/content';
import { db } from '../lib/db';
import { buildParagraphs, lemmaOf, type Token } from '../lib/lemmatize';
import WordModal, { type LookupRequest } from '../components/WordModal';

function currentScrollPosition(): number {
  const el = document.documentElement;
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
}

/**
 * Word buttons are atomic inline boxes, so the browser happily wraps a line
 * between a word and its punctuation (« lui | . ») or inside an elided pair
 * (« l' | étoile »). Glue every run of tokens with no space between them into
 * one group; the group renders inside a `white-space: nowrap` span.
 */
function groupTokens(tokens: Token[]): Token[][] {
  const parts: Token[] = [];
  for (const t of tokens) {
    if (t.word) parts.push(t);
    else for (const text of t.text.split(/(\s+)/)) if (text) parts.push({ text, word: null });
  }
  const groups: Token[][] = [];
  for (const t of parts) {
    const prev = groups[groups.length - 1];
    if (prev && !/\s/.test(prev[prev.length - 1].text) && !/\s/.test(t.text)) prev.push(t);
    else groups.push([t]);
  }
  return groups;
}

async function upsertProgress(articleId: number, patch: Partial<{ read: 0 | 1; position: number }>) {
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

export default function ArticlePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const article = getArticle(Number(id));

  const paragraphs = useMemo(
    () => (article ? buildParagraphs(article.content) : []),
    [article],
  );

  const savedLemmas = useLiveQuery(
    async () => new Set((await db.savedWords.toArray()).map((w) => w.lemma)),
    [],
  );

  const progress = useLiveQuery(
    () => (article ? db.articleProgress.get(article.id) : undefined),
    [article?.id],
  );

  const [lookup, setLookup] = useState<LookupRequest | null>(null);

  // Record the visit and restore the saved scroll position once.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!article) return;
    db.articleProgress.get(article.id).then((p) => {
      upsertProgress(article.id, {});
      if (!restoredRef.current) {
        restoredRef.current = true;
        if (p && p.position > 0 && !p.read) {
          const el = document.documentElement;
          window.scrollTo(0, p.position * (el.scrollHeight - el.clientHeight));
        } else {
          window.scrollTo(0, 0);
        }
      }
    });
  }, [article]);

  // Remember how far the learner scrolled (throttled + on leave).
  useEffect(() => {
    if (!article) return;
    let timer: number | null = null;
    const save = () => upsertProgress(article.id, { position: currentScrollPosition() });
    const onScroll = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        save();
      }, 1000);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer !== null) window.clearTimeout(timer);
      save();
    };
  }, [article]);

  // A text selection (long-press / drag) looks up the whole phrase.
  function handleSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const phrase = sel.toString().replace(/\s+/g, ' ').trim();
    if (phrase.length < 2 || !phrase.includes(' ')) return;
    setLookup({
      display: phrase,
      term: phrase.toLowerCase(),
      sentence: '',
      articleId: article?.id ?? null,
    });
  }

  if (!article) {
    return (
      <>
        <h2 className="page-heading">Article not found</h2>
        <Link className="btn btn--ghost" to="/reading">
          ← Back to the library
        </Link>
      </>
    );
  }

  const isRead = progress?.read === 1;

  return (
    <>
      <div className="article-topbar">
        <Link to="/reading" className="article-topbar__back">
          ← Library
        </Link>
        <span className={`level-badge level-badge--${article.cefr_level}`}>
          {article.cefr_level}
        </span>
      </div>

      <h2 className="article-title">{article.title}</h2>
      <p className="article-subtitle">{article.title_en}</p>
      <p className="article-meta">
        {article.word_count} words · {article.readingMinutes} min read
        {isRead && <span className="read-stamp"> · Read ✓</span>}
      </p>

      <div className="article-body" onPointerUp={handleSelection}>
        {paragraphs.map((sentences, pi) => (
          <p key={pi}>
            {sentences.map((sentence, si) => (
              <span key={si}>
                {groupTokens(sentence.tokens).map((group, gi) => (
                  <span key={gi} className={group.length > 1 ? 'nobreak' : undefined}>
                    {group.map((token, ti) => {
                      if (!token.word) return <span key={ti}>{token.text}</span>;
                      const savedClass = savedLemmas?.has(lemmaOf(token.word))
                        ? ' w--saved'
                        : '';
                      const openLookup = () =>
                        setLookup({
                          display: token.word!,
                          term: lemmaOf(token.word!),
                          sentence: sentence.text,
                          articleId: article.id,
                        });
                      if (pi === 0 && si === 0 && gi === 0 && ti === 0) {
                        // Newspaper drop cap on the article's opening letter; an
                        // elision opener (« L'or ») keeps its apostrophe in the cap.
                        const cap = /['’]/.test(token.text[1] ?? '')
                          ? token.text.slice(0, 2)
                          : token.text.slice(0, 1);
                        const rest = token.text.slice(cap.length);
                        return (
                          <span key={ti}>
                            <button className="w dropcap" onClick={openLookup}>
                              {cap}
                            </button>
                            {rest && (
                              <button className={`w${savedClass}`} onClick={openLookup}>
                                {rest}
                              </button>
                            )}
                          </span>
                        );
                      }
                      return (
                        <button key={ti} className={`w${savedClass}`} onClick={openLookup}>
                          {token.text}
                        </button>
                      );
                    })}
                  </span>
                ))}{' '}
              </span>
            ))}
          </p>
        ))}
      </div>

      <div className="article-end">
        <button
          className={`btn ${isRead ? 'btn--ghost' : 'btn--accent'}`}
          onClick={async () => {
            if (isRead) {
              await upsertProgress(article.id, { read: 0 });
            } else {
              await upsertProgress(article.id, { read: 1 });
              navigate('/reading', { state: { justRead: article.id } });
            }
          }}
        >
          {isRead ? 'Mark as unread' : 'Mark as read ✓'}
        </button>
      </div>

      {lookup && <WordModal request={lookup} onClose={() => setLookup(null)} />}
    </>
  );
}
