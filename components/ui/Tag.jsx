// A small status/category label. tone picks a semantic color from the
// --color-* scale (theme-aware by construction); band opts into the
// existing alliance heraldry system (.k-wb + .k-gem) instead of a tone,
// for anything that represents 710 / RED / SKY rather than a status.
const TONE_CLASS = {
  neutral: 'ui-tag-neutral',
  accent: 'ui-tag-accent',
  success: 'ui-tag-success',
  danger: 'ui-tag-danger',
};

import { bandProps } from '../../lib/alliances.mjs';

export default function Tag({ tone = 'neutral', band, className = '', children, ...rest }) {
  if (band) {
    return (
      <span className={`ui-tag k-wb ${className}`} {...bandProps(band)} {...rest}>
        <span className="k-gem" aria-hidden="true" />
        {children}
      </span>
    );
  }
  const toneClass = TONE_CLASS[tone] || TONE_CLASS.neutral;
  return (
    <span className={`ui-tag ${toneClass} ${className}`} {...rest}>
      {children}
    </span>
  );
}
