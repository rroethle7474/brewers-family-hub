-- 0002_lock_validate_prediction_range_search_path.sql
-- Lock the search_path on the predictions validation function so an unprivileged
-- role can't shadow `standings_snapshot` from another schema and trick the
-- function into reading the wrong table.
--
-- Caught by Supabase's security advisor (lint 0011_function_search_path_mutable)
-- right after 0001 landed. The companion function `prevent_admin_self_promotion`
-- already had this set; this migration brings `validate_prediction_range` in line.

alter function public.validate_prediction_range()
  set search_path = public, pg_temp;
