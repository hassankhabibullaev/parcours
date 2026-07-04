import { useState } from 'react';
import { keyClick, setSfxEnabled, sfxEnabled } from '../lib/sound';
import { SpeakerIcon, SpeakerOffIcon } from './icons';

/** The speaker HUD pill toggling drill sound effects (persisted in localStorage). */
export default function SoundPill() {
  const [on, setOn] = useState(sfxEnabled);

  function toggle() {
    const next = !on;
    setSfxEnabled(next);
    setOn(next);
    if (next) keyClick();
  }

  return (
    <button
      type="button"
      className="hud-pill hud-pill--btn"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Mute sound effects' : 'Unmute sound effects'}
    >
      {on ? (
        <SpeakerIcon className="hud-pill__icon" />
      ) : (
        <SpeakerOffIcon className="hud-pill__icon" />
      )}
    </button>
  );
}
