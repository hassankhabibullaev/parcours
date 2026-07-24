import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { isLexiconReady, lemmatizeTokens, onLexiconReady, type Sentence, type Token } from '../lib/lemmatize';
import { findExpressions } from '../lib/expressions';
import type { LookupRequest } from './WordModal';

/**
 * The tappable reading surface, shared by the article view and the book
 * chapter view: every word is a one-tap lookup button, fixed expressions are
 * picked up whole, and words the learner is STILL LEARNING are highlighted —
 * learned words read as plain text again (the highlight tracks what still
 * needs attention, not everything ever saved).
 */

interface ReaderBodyProps {
  paragraphs: Sentence[][];
  /** Provenance stored with saved words (null when reading a book). */
  articleId: number | null;
  onLookup: (request: LookupRequest) => void;
  /** Newspaper drop cap on the opening letter (the article view's look). */
  dropCap?: boolean;
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

export default function ReaderBody({ paragraphs, articleId, onLookup, dropCap }: ReaderBodyProps) {
  // Only words still in Learning are highlighted — a learned word's lemma
  // leaves this set and its inflections render unmarked.
  const learningLemmas = useLiveQuery(
    async () =>
      new Set((await db.savedWords.where('learned').equals(0).toArray()).map((w) => w.lemma)),
    [],
  );

  // Re-render once the full lexicon loads so highlighting and tap-lemmas pick
  // up its better base forms (tokens themselves don't change).
  const [, setLexReady] = useState(isLexiconReady());
  useEffect(() => onLexiconReady(() => setLexReady(true)), []);

  return (
    <div className="article-body">
      {paragraphs.map((sentences, pi) => (
        <p key={pi}>
          {sentences.map((sentence, si) => {
            // Context-aware lemmas for this sentence: a determiner before a
            // verb/noun homograph reads it as a noun (« le livre » → livre).
            const lemmas = lemmatizeTokens(sentence.tokens);
            // Fixed expressions (« grâce à », « se trouve ») — tapping any
            // word inside one looks up the whole phrase in context.
            const expressions = findExpressions(sentence.tokens, lemmas);
            return (
              <span key={si}>
                {groupTokens(sentence.tokens).map((group, gi) => (
                  <span key={gi} className={group.length > 1 ? 'nobreak' : undefined}>
                    {group.map((token, ti) => {
                      if (!token.word) return <span key={ti}>{token.text}</span>;
                      const lemma = lemmas.get(token) ?? token.word;
                      const expr = expressions.get(token);
                      const savedClass = learningLemmas?.has(expr ? expr.term : lemma)
                        ? ' w--saved'
                        : '';
                      const openLookup = () =>
                        onLookup(
                          expr
                            ? {
                                display: expr.text,
                                term: expr.term,
                                gloss: expr.gloss || undefined,
                                sentence: sentence.text,
                                articleId,
                              }
                            : {
                                display: token.word!,
                                term: lemma,
                                sentence: sentence.text,
                                articleId,
                              },
                        );
                      if (dropCap && pi === 0 && si === 0 && gi === 0 && ti === 0) {
                        // Newspaper drop cap on the opening letter; an elision
                        // opener (« L'or ») keeps its apostrophe in the cap.
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
            );
          })}
        </p>
      ))}
    </div>
  );
}
