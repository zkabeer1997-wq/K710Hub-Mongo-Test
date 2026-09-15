import { getCollection } from './mongo';
import { COLLECTIONS } from './mongoCollections';
import { FORM_META_KEYS, mergeFormFields, mergeFormIntro } from './formFieldMeta.mjs';

export async function getFormFieldMeta(formKey) {
  if (!FORM_META_KEYS.includes(formKey)) return null;
  const coll = await getCollection(COLLECTIONS.FORM_FIELD_META);
  const doc = await coll.findOne({ form_key: formKey });
  return {
    form_key: formKey,
    intro: mergeFormIntro(formKey, doc?.intro),
    fields: mergeFormFields(formKey, doc?.fields),
  };
}

export async function saveFormFieldMeta(formKey, { intro, fields }) {
  if (!FORM_META_KEYS.includes(formKey)) {
    throw new Error('Unknown form.');
  }
  const coll = await getCollection(COLLECTIONS.FORM_FIELD_META);
  const setDoc = { form_key: formKey, updated_at: new Date() };
  if (intro) {
    setDoc.intro = {
      kicker: String(intro.kicker || '').slice(0, 120),
      heading: String(intro.heading || '').slice(0, 160),
      description: String(intro.description || '').slice(0, 500),
    };
  }
  if (Array.isArray(fields)) {
    setDoc.fields = fields.map((f, index) => ({
      key: String(f.key || ''),
      label: String(f.label || '').slice(0, 120),
      placeholder: String(f.placeholder || '').slice(0, 160),
      help_text: String(f.help_text || '').slice(0, 300),
      order: Number.isFinite(f.order) ? f.order : index,
    })).filter((f) => f.key);
  }
  await coll.updateOne({ form_key: formKey }, { $set: setDoc }, { upsert: true });
  return getFormFieldMeta(formKey);
}
