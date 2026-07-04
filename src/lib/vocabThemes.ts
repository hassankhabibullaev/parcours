import type { CSSProperties } from 'react';

/**
 * Visual identities for the vocabulary practice modes, mirroring the
 * per-tense identities in tenseThemes.ts so both modules share one design
 * language: `color` is the saturated identity (stripes, badges, focus rings),
 * `blob` the pale gradient tint on launcher cards, `wash` a translucent
 * background tint, `stripe` the progress-bar / card-top gradient.
 */

export type VocabMode = 'learn' | 'practice' | 'remember';

export interface VocabTheme {
  color: string;
  blob: string;
  wash: string;
  stripe: string;
}

function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function theme(color: string, blob: string): VocabTheme {
  return {
    color,
    blob,
    wash: rgba(color, 0.11),
    stripe: `linear-gradient(90deg, ${color}, ${blob})`,
  };
}

export const VOCAB_THEMES: Record<VocabMode, VocabTheme> = {
  learn: theme('#5b9438', '#bcdca0'),
  practice: theme('#5d8fbe', '#d4e4f4'),
  remember: theme('#c89018', '#f5d878'),
};

/** The CSS vars the drill pages set inline (same contract as conjugation). */
export function vocabThemeVars(mode: VocabMode): CSSProperties {
  const t = VOCAB_THEMES[mode];
  return { '--tc': t.color, '--tc-wash': t.wash, '--stripe': t.stripe } as CSSProperties;
}
