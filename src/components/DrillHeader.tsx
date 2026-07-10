import { Link } from 'react-router-dom';

interface DrillHeaderProps {
  title: string;
  backTo?: string;
  backLabel?: string;
}

export default function DrillHeader({
  title,
  backTo = '/vocabulary',
  backLabel = 'Vocabulary',
}: DrillHeaderProps) {
  return (
    <>
      <div className="article-topbar">
        <Link to={backTo} className="article-topbar__back">
          ← {backLabel}
        </Link>
      </div>
      <h2 className="page-heading">{title}</h2>
    </>
  );
}
