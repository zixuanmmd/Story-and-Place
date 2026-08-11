-- Timeline RPCs are SECURITY INVOKER and reference entry_participants while
-- evaluating the "mine" scope. PostgreSQL checks table privileges even when an
-- anonymous request ultimately selects only a public user timeline.
--
-- Anonymous callers receive SELECT at the table ACL layer, but the table has
-- RLS enabled and no anon SELECT policy, so direct anonymous queries still
-- return zero rows. This preserves participant-invitation privacy while making
-- the public timeline RPC usable.

grant select on table public.entry_participants to anon;

notify pgrst, 'reload schema';
