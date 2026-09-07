import ConsoleToolLayout from '../../../components/tools/ConsoleToolLayout';
import HeroGearPlannerApp from '../../../components/tools/hero-gear-planner/HeroGearPlannerApp';

export const metadata = {
  title: 'Hero Gear Planner | K710Hub',
  description: 'Plan Enhancement and Mastery investment across Infantry, Cavalry, and Archer hero gear and get an optimized upgrade order.',
};

const BREADCRUMB = [
  { href: '/tools', label: 'Tools & Calculators' },
  { href: '/tools?category=Hero%20Gear', label: 'Hero Gear' },
  { label: 'Hero Gear Planner' },
];

export default function Page() {
  return (
    <ConsoleToolLayout breadcrumb={BREADCRUMB}>
      <HeroGearPlannerApp />
    </ConsoleToolLayout>
  );
}
