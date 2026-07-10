import { useLiveQuery } from 'dexie-react-hooks';
import { db, setKV } from './db';
import type { CefrLevel } from '../data/content';

/**
 * User preferences.
 *
 * The current CEFR level lives in the synced kv table (it is part of the
 * learner's account state — every device should suggest the same articles).
 * The audio prefs are device-local UI settings, so they live in localStorage
 * next to the sound-effects toggle.
 */

/** The levels the corpus actually covers (no C1/C2 content). */
export const USER_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2'];

/** '' = not set (the default): no filtering anywhere. */
export type UserLevel = CefrLevel | '';

const LEVEL_KEY = 'userLevel';

export async function setUserLevel(level: UserLevel): Promise<void> {
  await setKV(LEVEL_KEY, level);
}

/**
 * Live view of the level setting: `undefined` while loading, then '' or a
 * level. Reactive — updates when the setting changes or a sync pulls it in.
 */
export function useUserLevel(): UserLevel | undefined {
  return useLiveQuery(async () => {
    const entry = await db.kv.get(LEVEL_KEY);
    const value = entry?.value ?? '';
    return (USER_LEVELS as string[]).includes(value) ? (value as CefrLevel) : '';
  }, []);
}

/* ——— Device-local audio prefs (mirror the sfx toggle's storage pattern) ——— */

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    /* storage unavailable — the toggle still works for this session */
  }
}

const TITLE_SPEECH_KEY = 'parcours-speak-titles';
const LOOKUP_SPEECH_KEY = 'parcours-speak-lookups';

/** Read article titles aloud once their typewriter reveal finishes. */
export const titleSpeechEnabled = (): boolean => readFlag(TITLE_SPEECH_KEY);
export const setTitleSpeechEnabled = (on: boolean): void => writeFlag(TITLE_SPEECH_KEY, on);

/** Auto-pronounce a word when its lookup modal opens. */
export const lookupSpeechEnabled = (): boolean => readFlag(LOOKUP_SPEECH_KEY);
export const setLookupSpeechEnabled = (on: boolean): void => writeFlag(LOOKUP_SPEECH_KEY, on);
