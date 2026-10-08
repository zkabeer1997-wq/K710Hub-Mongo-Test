import GuideBuilder from '../../../../../components/admin/guidebuilder/GuideBuilder';

export const metadata = { title: 'Guide page builder', robots: { index: false, follow: false } };

export default async function GuideBuilderPage({ params }) {
  const { slug } = await params;
  return <GuideBuilder slug={slug} />;
}
