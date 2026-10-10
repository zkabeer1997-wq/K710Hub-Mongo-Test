'use client';

import Link from 'next/link';
import { useT } from '../i18n/LanguageProvider';

// Home hero, signed-out visitors only (the page renders it only then):
// the member counterpart of "Apply to transfer", same solid primary weight.
export default function HeroSignInLink() {
  const t = useT();
  return <Link href="/login" className="home-v2-primary home-v2-signin">{t('signin.hero.cta')}</Link>;
}
