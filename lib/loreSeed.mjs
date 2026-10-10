// The first ten 710 Lore stories and the function that adds the missing ones (used by the admin
// "Add the first 10 stories" button and by scripts/seed-lore.mjs). Existing stories are never overwritten.
import { normalizeLoreBody } from './lore.mjs';

export const STORIES = [
  {
    number: 1,
    title: 'It all started at Badlands',
    body: `I'm originally from the Badlands of 716. I had to leave after my entire family was eaten by a level 4 Alpha Black Panther. I eventually found a job at the Level 7 Idle Quarry. That's where I met a fluffy alpaca from 710, who said to me, "Come on, Danko—buy some Charm Packs!" The alpaca had a tragic past. When he was young, he was bullied by the Royal Cavalry. Ever since then, he has hated cavalry with all his heart. We became friends, and I followed the alpaca to 710...`,
  },
  {
    number: 2,
    title: 'Filipino Friends',
    body: `When I arrived to 710, Alpaca dude told me to talk to Mr Who, local Filipinos Mafia Boss. He looked at my gear "wowwww, bro Danko". I have asked him for a bear spot, but he said  "You... come to me on the day prior to KvK prep, asking me for a favour... but you have exceeded side event points cap 10x. What have I ever done to make you treat me so disrespectfully?". We became friends eventually, I was helping Filipinos mafia friends with Mithril and Black Panther (happilly) fur contraband to 709 and 729. Ingat kayo!`,
  },
  {
    number: 3,
    title: 'Looked for Mithril, but found ...',
    body: `Once we were mining for mithril.. suddenly the ground collapsed, and I ended up in an underground cave. It was dark but some creature approached me "did you know that this event charms designs is 27.2312% better vs best packs?". I said "y-yeahh, s-ssure, makes sense" while looking how to get out. "I have 1GB Excel with all the game data, do you know the cost of TG10?" he continued. Finally I saw his face and told him "wow, nice hair bro, u use H&S a lot?". This draw came with me and joined RED..  People say he likes Khorror movies and does not like Khorruption`,
  },
  {
    number: 4,
    title: 'CR7 or not to be?',
    body: `I was doing merchant caravan recently with my fat Alpaca. We got lost and found ourselves in the Arabian Desert (yes, we have one in 710).. We ran out of food and water.  Only a miracle could save us. Suddenly, we saw an oasis in the distance, the Hotel "Mola Hyper Luxury 7 Stars". There was a man in a thobe. I said "can we pl...", he interrupted "Messi or CR7?". I was like "what? bro, we are dying, give us water. "Messy or CR7?" he insisted. I covered my Messi tattoo with hand and told him "CR7"... Sadly Alpaca was wearing a Messi shirt..`,
  },
  {
    number: 5,
    title: "Family matters, don't shoot",
    body: `Over time, 710 people started asking me for advice. One day the girl with the name N came to me: "I have a problem.. my husband.." and she started crying.. I asked what is the matter. She continued "He believes he is Neo from Matrix.. he is yelling "this is totally bonkers!!!" all the time and asks me to shoot at him as if he can dodge bullets like the One.. Should I actually shoot a few?" I told her "No, dont". This is how Danko saves lives and families. Lesson of the day: don't shoot at your partners..`,
  },
  {
    number: 6,
    title: 'The crime of the century',
    body: `Alpaca was living a peaceful life, slowly securing "fattest alpaca" status with steady calorie intake. Until one terrible moment. One day Alpaca opened the fridge... his chocolate cake was gone, completely... Alpaca narrowed his eyes: "This means war." He opened the 710 Yellow Pages and looked under: "Assassins." He picked the first ad and called. A person with a Turkish accent said, "The case is brutal, but I can take care of it." Alpaca said, "Just find the person. I need to do it myself; this is personal now."`,
  },
  {
    number: 7,
    title: 'The Korean connection in the case',
    body: `Mr. Assassin searched for the thief and found a clue. "Go to that Korean place and find the girl pretending to be Korean." Alpaca went there. He approached the bartender, Mr. Yumin. "Pour me something." "Sorry, sir. I can't—I've drunk everything."

Alpaca noticed a lonely girl in the corner. "Can I?" he asked. She nodded. "Are you Korean?"
She: "Ah, yes! Very Korean!"
He: "Why do you eat fries in a Korean place?"
She: "Ah, I finished all that Korean food already."

The tension grew, filling the room with uneasy silence.`,
  },
  {
    number: 8,
    title: 'Chocolate Cake Thief....',
    body: `Alpaca said, "We both know what you did."
She: "I have no idea..."

Alpaca asked the waiter, "Bring chocolate cake, please."
The waiter: "Sorry, mister, we don't have any chocolate here."

Alpaca: "Then why does the girl have it on her face?"

The girl hid her face in her hands and said, "Fine, you caught me."

Alpaca: "No tricks now, there's an assassin waiting for us outside. I paid him a whole tank of Turkish tea..."

She: "Okay, but I just had a few bites. The cake is still at home."`,
  },
  {
    number: 9,
    title: 'Alpacalypsis....',
    body: `The girl was renting a small apartment in the Sanctuary 4. They walked in, Assassin was waiting outside. "Let's all finish this" said Alpaca. The girls said "ok, you want some ice coffee"?. Alpaca nodded and looked at the wall, there was a big picture of horsemen.. "you like horses?".She: "Yes, I like everything cavalry related". She turned on the coffee machine. Suddenly, it made a piercing, terrible noise, and the alpaca fell to the floor and lost consciousness. Assassin rushed in, but she has already escaped through the window`,
  },
  {
    number: 10,
    title: 'Superb Healthcare of 710',
    body: `The Assassin brought Alpaca to the local Doctor Legend. Doctor Legend: "Hmm, I don't eat meat, but I can take the fur."

Assassin: "What? No! Help him!"

Doctor: "Ah, yes, sure. Did you try batch healing?"

Assassin: "Yes, but it did not work."

Doctor: "Okay, sorry. I can't help you. I specialize in post-swordland healing."

Assassin: "Hmm, you don't need to heal after the Swordland."

Doctor Legend said with a wink, "Well, we still sell insurance for that."

Alpaca caught the scent of Doctor's chocolate on the table and woke up.

"That will be $3,500," said Doctor Legend.`,
  },
];


export async function seedLore({ coll, overwrite = false, now = new Date() }) {
  await coll.createIndex({ number: 1 }, { unique: true, name: 'number_unique' });
  const result = { inserted: 0, updated: 0, kept: 0 };
  for (const story of STORIES) {
    const fields = { number: story.number, title: story.title, body: normalizeLoreBody(story.body) };
    if (overwrite) {
      const r = await coll.updateOne({ number: story.number }, {
        $set: { title: fields.title, body: fields.body, updated_at: now },
        $setOnInsert: { number: story.number, published: true, created_at: now },
      }, { upsert: true });
      if (r.upsertedCount) result.inserted += 1; else result.updated += 1;
    } else {
      const r = await coll.updateOne({ number: story.number }, {
        $setOnInsert: { ...fields, published: true, created_at: now, updated_at: now },
      }, { upsert: true });
      if (r.upsertedCount) result.inserted += 1; else result.kept += 1;
    }
  }
  return result;
}

