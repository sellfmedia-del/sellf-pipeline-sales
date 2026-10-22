begin;
-- Server-only offer worker needs only the four registration fields used by
-- pipeline_offer_team_user. No client role or Auth record is changed.
grant select(id,is_anonymous,raw_app_meta_data,deleted_at) on auth.users to service_role;
commit;
