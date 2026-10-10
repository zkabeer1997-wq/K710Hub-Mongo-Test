import { PageHero } from '../../components/ui';
import LoreStory from '../../components/lore/LoreStory';
import { loadPublishedStories } from '../../lib/lore.server';
import './lore.css';

export const metadata = {
  title: '710 Lore',
  description: 'Short tall tales from Kingdom 710 about Danko and the Alpaca: the Badlands, the Filipino mafia, a stolen chocolate cake and the superb healthcare of 710.',
  alternates: { canonical: '/lore' },
};

export const dynamic = 'force-dynamic';

export default async function LorePage() {
  const stories = await loadPublishedStories();
  // The stories are English only: data-no-translate keeps the runtime translation overlay (and browser translators) out of this content.
  // The site header and footer around it translate as usual.
  return (
    <main className="theme-realm lore-page" lang="en" translate="no" data-no-translate="">
      <PageHero
        eyebrow="Kingdom 710"
        title="710 Lore"
        lede="Tall tales of Danko and the Alpaca, first told in Discord. Read them in order, from Story 1."
      />
      <div className="lore-wrap">
        {stories.length === 0 ? (
          <section className="lore-empty" aria-labelledby="lore-empty-h">
            <h2 id="lore-empty-h">Stories coming soon</h2>
            <p>Danko and the Alpaca are still on the road. The first tales will appear here.</p>
          </section>
        ) : (
          <div className="lore-list">
            {stories.map((story, i) => <LoreStory key={story.number} story={story} priority={i === 0} />)}
          </div>
        )}
      </div>
    </main>
  );
}
