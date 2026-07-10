export interface SectionTabDef<K extends string> {
  key: K;
  label: string;
}

interface SectionTabsProps<K extends string> {
  ariaLabel: string;
  tabs: SectionTabDef<K>[];
  active: K;
  onSelect: (key: K) => void;
}

/**
 * The shared section layout is: section name header → two tabs → content.
 * This is the tabs row — one segmented control used identically by Reading,
 * Vocabulary, Conjugation and Profile.
 */
export default function SectionTabs<K extends string>({
  ariaLabel,
  tabs,
  active,
  onSelect,
}: SectionTabsProps<K>) {
  return (
    <div className="seg-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={`seg-tab${active === t.key ? ' seg-tab--active' : ''}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
