import { useSearchParams } from 'react-router-dom';
import ConjugationPicker from '../components/ConjugationPicker';
import VocabDrills from '../components/VocabDrills';

type Tab = 'vocabulary' | 'conjugation';

/**
 * Practice hub — two tabs. Vocabulary lists the three word drills; Conjugation
 * holds the tense picker. The active tab lives in the URL (`?tab=conjugation`)
 * so a drill's back link can return the learner to the tab they came from.
 */
export default function PracticeHubPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'conjugation' ? 'conjugation' : 'vocabulary';

  const select = (t: Tab) =>
    setParams(t === 'conjugation' ? { tab: 'conjugation' } : {}, { replace: true });

  return (
    <>
      <h2 className="page-heading">Practice</h2>
      <p className="page-subheading">Sharpen what you’ve learnt — words and verbs.</p>

      <div className="seg-tabs" role="tablist" aria-label="Practice type">
        <button
          role="tab"
          aria-selected={tab === 'vocabulary'}
          className={`seg-tab${tab === 'vocabulary' ? ' seg-tab--active' : ''}`}
          onClick={() => select('vocabulary')}
        >
          Vocabulary
        </button>
        <button
          role="tab"
          aria-selected={tab === 'conjugation'}
          className={`seg-tab${tab === 'conjugation' ? ' seg-tab--active' : ''}`}
          onClick={() => select('conjugation')}
        >
          Conjugation
        </button>
      </div>

      {tab === 'vocabulary' ? <VocabDrills /> : <ConjugationPicker />}
    </>
  );
}
