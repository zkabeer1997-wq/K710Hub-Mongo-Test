update public.power_profiles as profile
set
  infantry_tier = coalesce(profile.infantry_tier, submission.infantry_tier),
  infantry_tg = coalesce(profile.infantry_tg, submission.infantry_tg),
  cavalry_tier = coalesce(profile.cavalry_tier, submission.cavalry_tier),
  cavalry_tg = coalesce(profile.cavalry_tg, submission.cavalry_tg),
  archer_tier = coalesce(profile.archer_tier, submission.archer_tier),
  archer_tg = coalesce(profile.archer_tg, submission.archer_tg),
  heroes = case
    when cardinality(profile.heroes) = 0 then coalesce(submission.heroes, '{}')
    else profile.heroes
  end
from public.submissions as submission
where btrim(profile.member_id) = btrim(submission.member_id)
  and (
    profile.infantry_tier is null
    or profile.infantry_tg is null
    or profile.cavalry_tier is null
    or profile.cavalry_tg is null
    or profile.archer_tier is null
    or profile.archer_tg is null
    or cardinality(profile.heroes) = 0
  );
