update public.power_profiles as profile
set
  infantry_tier = coalesce(profile.infantry_tier, form.infantry_tier),
  infantry_tg = coalesce(profile.infantry_tg, form.infantry_tg),
  cavalry_tier = coalesce(profile.cavalry_tier, form.cavalry_tier),
  cavalry_tg = coalesce(profile.cavalry_tg, form.cavalry_tg),
  archer_tier = coalesce(profile.archer_tier, form.archer_tier),
  archer_tg = coalesce(profile.archer_tg, form.archer_tg),
  heroes = case
    when cardinality(profile.heroes) = 0 then coalesce(form.heroes, '{}')
    else profile.heroes
  end
from public.flamedragon_forms as form
where btrim(profile.member_id) = btrim(form.member_id)
  and (
    profile.infantry_tier is null
    or profile.infantry_tg is null
    or profile.cavalry_tier is null
    or profile.cavalry_tg is null
    or profile.archer_tier is null
    or profile.archer_tg is null
    or cardinality(profile.heroes) = 0
  );
