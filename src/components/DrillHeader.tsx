import { Link } from 'react-router-dom';

interface DrillHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
}

export default function DrillHeader({
  title,
  subtitle,
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
      {subtitle && <p className="page-subheading">{subtitle}</p>}
    </>
  );
}
