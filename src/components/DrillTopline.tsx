import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface DrillToplineProps {
  backTo: string;
  backLabel: string;
  title: string;
  /** HUD pills, right-aligned after the title. */
  children?: ReactNode;
}

/**
 * Compact one-line header for active drill sessions (back link + title +
 * HUD pills) — keeps the whole exercise on screen without scrolling.
 * Gate and results screens keep the roomier DrillHeader.
 */
export default function DrillTopline({ backTo, backLabel, title, children }: DrillToplineProps) {
  return (
    <div className="drill-topline">
      <Link to={backTo} className="drill-topline__back">
        ←<span className="drill-topline__backtext"> {backLabel}</span>
      </Link>
      <h2 className="drill-topline__title">{title}</h2>
      {children}
    </div>
  );
}
