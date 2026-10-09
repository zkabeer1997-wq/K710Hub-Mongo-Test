"use client";
import styles from "./ProfileSeedNotice.module.css";

const formatDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

// What: "Governor Gear" / "charm levels". Shows either the one-tap offer (tool
// already has saved inputs) or a quiet line after an automatic first start.
export default function ProfileSeedNotice({ seed, what }) {
  if (seed.notice) {
    const date = formatDate(seed.notice.updatedAt);
    return (
      <div className={styles.notice} role="status">
        <p>{date ? `Your profile was updated on ${date}.` : "Your profile was updated."} Your saved {what} here are older.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={seed.applyProfile}>Use my profile values</button>
          <button type="button" onClick={seed.dismiss}>Not now</button>
        </div>
      </div>
    );
  }
  if (seed.seeded !== null) {
    const date = formatDate(seed.seeded);
    return <p className={styles.quiet} role="status">Started from your profile{date ? ` (updated ${date})` : ""}: {what}. Change anything you like.</p>;
  }
  return null;
}
