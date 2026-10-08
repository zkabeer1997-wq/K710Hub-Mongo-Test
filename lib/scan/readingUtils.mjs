// Helpers on FieldReading objects: { value, confidence, alternatives?, flags[] }.

export const INVALID_CONFIDENCE_FACTOR = 0.4;

export function isFieldReading(x) {
  return !!x && typeof x === 'object' && 'value' in x && typeof x.confidence === 'number';
}

/** Returns a copy with confidence multiplied and the flag added. The value is NEVER changed. */
export function penalize(field, flag, factor = INVALID_CONFIDENCE_FACTOR) {
  if (!isFieldReading(field)) return field;
  const flags = field.flags ? [...field.flags] : [];
  if (!flags.includes(flag)) flags.push(flag);
  return { ...field, confidence: Math.max(0, Math.min(1, field.confidence * factor)), flags };
}

export function fieldsOf(reading) {
  if (isFieldReading(reading)) return [reading];
  if (!reading || typeof reading !== 'object') return [];
  return Object.values(reading).filter(isFieldReading);
}

/** True when any field is below the threshold or carries a flag. */
export function needsReview(reading, threshold = 0.8) {
  const fields = fieldsOf(reading);
  if (fields.length === 0) return true;
  return fields.some((f) => f.confidence < threshold || (f.flags && f.flags.length > 0) || f.value === null);
}
