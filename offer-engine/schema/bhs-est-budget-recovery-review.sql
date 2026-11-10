-- REVIEW ONLY. NOT APPLIED. Requires release approval AND explicit approval
-- to resume this existing paid run. Pipeline gxngmqewskhrbxqmnpps /
-- pvpknoqioxgyerinoecv. No balance, cap or paid receipt is reset.
begin;
do $$
declare j public.pipeline_bhs_jobs; b public.pipeline_offer_budgets;
begin
 select * into j from public.pipeline_bhs_jobs where id='2ea4abc0-a587-4573-bb11-fedcefb0cdfb' for update;
 if not found or j.mode<>'production' or j.lead_id<>'id_yjkqgpqlwm9muz7wgza' or j.budget_id<>'b5ea241d-7587-49a8-8b17-a8e81f7e30fe' or j.spec->>'researchRunId'<>'564f98e6-6d12-425a-99bc-dd018b1659a2' or j.phase<>'competition_review' or j.state<>'paused' or j.diagnostic->>'code'<>'budget_limit' then raise exception 'Recovery target changed; review required';end if;
 if j.claims>=40 or j.created_at<now()-interval '2 hours' then raise exception 'Job age/claim guard requires separate recovery review';end if;
 select * into b from public.pipeline_offer_budgets where id=j.budget_id for update;
 if b.cap_kurus<>5000 or b.charged_kurus<>3837 then raise exception 'Original budget changed; review required';end if;
 update public.pipeline_bhs_jobs set spec=spec||jsonb_build_object('budgetRecoveryVersion','shared-budget-v1','budgetRecoveryPhase','competition_review'),state='queued',lease_token=null,lease_until=null,updated_at=now() where id=j.id;
end $$;
select id,phase,state,budget_id,spec->>'budgetRecoveryVersion' as recovery_version from public.pipeline_bhs_jobs where id='2ea4abc0-a587-4573-bb11-fedcefb0cdfb';
commit;
-- Before approval/export the exact original job row into the release record.
-- After application, verify progress and the unchanged 5,000-kurus cap.
-- Rollback: cancel_requested=true if running, otherwise state='paused';
-- preserve all old and new charges and export the resulting job state.
