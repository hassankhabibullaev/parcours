interface IconProps {
  className?: string;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** The editor's desk (home). */
export function DeskIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </svg>
  );
}

/** An open broadsheet, spread flat (reading). */
export function NewspaperIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 6.3C10.3 4.9 7.9 4.4 4.5 4.4v13.2c3.4 0 5.8.6 7.5 2 1.7-1.4 4.1-2 7.5-2V4.4c-3.4 0-5.8.5-7.5 1.9Z" />
      <path d="M12 6.3v13.3" />
      <path d="M7.2 8.9h2.4M7.2 12h2.4M14.4 8.9h2.4M14.4 12h2.4" />
    </svg>
  );
}

/** A stack of flashcards, letter on top (vocabulary). */
export function LexiconIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8.5 4.5H18A1.5 1.5 0 0 1 19.5 6v9.5" />
      <rect x="4" y="8" width="12.5" height="12" rx="1.5" />
      <path d="m7.4 16.9 2.85-6.2 2.85 6.2" />
      <path d="M8.5 14.5h3.5" />
    </svg>
  );
}

/** A target / bullseye (practice — take aim at what needs work). */
export function PracticeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Sliders (settings). */
export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7.5h8M16.5 7.5H20" />
      <circle cx="14.5" cy="7.5" r="2.2" />
      <path d="M4 16.5h3.5M12 16.5h8" />
      <circle cx="9.5" cy="16.5" r="2.2" />
    </svg>
  );
}

/** A circled check (mark a word learned). */
export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.4 12.3 2.4 2.4 4.8-5.2" />
    </svg>
  );
}

/** A return arrow (send a learned word back into rotation). */
export function UndoIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 9.5h9a5 5 0 0 1 0 10H8" />
      <path d="M8 5.5 4.5 9.5 8 13.5" />
    </svg>
  );
}

/** A flat trash can (delete). */
export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V4.9a1.4 1.4 0 0 1 1.4-1.4h2.2a1.4 1.4 0 0 1 1.4 1.4v1.6" />
      <path d="m6.5 6.5.9 12.6a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.6" />
      <path d="M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

/** A plus (add to vocabulary). */
export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

/** A pencil (edit a saved translation). */
export function EditIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15.5 5.5 18.5 8.5 8.5 18.5 5 19.5 6 16 15.5 5.5Z" />
      <path d="M14 7 17 10" />
    </svg>
  );
}

/** A bare check (confirm an edit). */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </svg>
  );
}

/** An X (cancel an edit). */
export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** A flat muted speaker (sound effects off). */
export function SpeakerOffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M3.5 9.3v5.4h3.4l5.3 4.5V4.8L6.9 9.3H3.5Z" fill="currentColor" />
      <path
        d="m15.6 9.6 4.8 4.8M20.4 9.6l-4.8 4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A flat speaker (pronounce). */
export function SpeakerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M3.5 9.3v5.4h3.4l5.3 4.5V4.8L6.9 9.3H3.5Z" fill="currentColor" />
      <path
        d="M15.3 9.1a4.2 4.2 0 0 1 0 5.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M17.9 6.7a7.7 7.7 0 0 1 0 10.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
