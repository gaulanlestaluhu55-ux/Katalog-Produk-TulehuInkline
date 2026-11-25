-- REVIEW DRAFT ONLY. Do not apply to production until reviewed and tested on a separate database.
-- Existing migrations 001-009 must be present. No change to dashboard/UI paths.
begin;

create table if not exists public.mcp_status_receipts (
  request_id uuid primary key,
  actor_id text not null check (length(actor_id) between 1 and 120),
  order_kind text not null check (order_kind in ('regular','bulk')),
  order_id uuid not null,
  expected_status text not null,
  target_status text not null,
  before_status text,
  outcome jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.mcp_status_receipts enable row level security;
revoke all on table public.mcp_status_receipts from public, anon, authenticated, service_role;
grant select, insert on table public.mcp_status_receipts to service_role;

create or replace function public.mcp_set_order_status_audited(
  p_request_id uuid, p_actor_id text, p_kind text, p_order_id uuid,
  p_expected_status text, p_target_status text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_allowed text[];
  v_previous text;
  v_found boolean;
  v_receipt public.mcp_status_receipts%rowtype;
  v_outcome jsonb;
begin
  if p_kind = 'regular' then
    v_allowed := array['Baru','Diproses','Selesai','Diambil'];
  elsif p_kind = 'bulk' then
    v_allowed := array['Menunggu DP','Siap Produksi','Diproses','Selesai Produksi','Siap Diambil','Diambil'];
  else
    return jsonb_build_object('ok',false,'code','INVALID_INPUT');
  end if;
  if p_request_id is null or p_order_id is null or p_actor_id is null
     or length(trim(p_actor_id)) not between 1 and 120
     or p_expected_status is null or p_target_status is null
     or not (p_expected_status = any(v_allowed)) or not (p_target_status = any(v_allowed))
     or (p_expected_status = 'Diambil' and p_target_status <> 'Diambil') then
    return jsonb_build_object('ok',false,'code','INVALID_INPUT');
  end if;

  -- Serialize replays of the same request ID across concurrent calls. Hash collisions only cause waiting.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into v_receipt from public.mcp_status_receipts where request_id = p_request_id;
  if found then
    if v_receipt.actor_id is distinct from p_actor_id or v_receipt.order_kind is distinct from p_kind
       or v_receipt.order_id is distinct from p_order_id or v_receipt.expected_status is distinct from p_expected_status
       or v_receipt.target_status is distinct from p_target_status then
      return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');
    end if;
    -- A replay reports the original outcome, not the order's current status.
    return v_receipt.outcome || jsonb_build_object('replayed',true);
  end if;

  if p_kind = 'regular' then
    select status into v_previous from public.orders where id = p_order_id for update;
    v_found := found;
  else
    select status into v_previous from public.bulk_orders where id = p_order_id for update;
    v_found := found;
  end if;

  if not v_found then
    v_outcome := jsonb_build_object('ok',false,'code','NOT_FOUND');
  elsif v_previous = p_target_status then
    v_outcome := jsonb_build_object('ok',true,'id',p_order_id,'status',p_target_status,'changed',false);
  elsif v_previous is distinct from p_expected_status then
    v_outcome := jsonb_build_object('ok',false,'code','STATUS_CONFLICT','current_status',v_previous);
  else
    if p_kind = 'regular' then
      update public.orders set status = p_target_status where id = p_order_id;
    else
      update public.bulk_orders set status = p_target_status where id = p_order_id;
    end if;
    v_outcome := jsonb_build_object('ok',true,'id',p_order_id,'status',p_target_status,'changed',true);
  end if;
  -- Receipt and status change commit or roll back together.
  v_outcome := v_outcome || jsonb_build_object('request_id',p_request_id,'replayed',false);
  insert into public.mcp_status_receipts
    (request_id,actor_id,order_kind,order_id,expected_status,target_status,before_status,outcome)
  values (p_request_id,p_actor_id,p_kind,p_order_id,p_expected_status,p_target_status,v_previous,v_outcome);
  return v_outcome;
end;
$$;
revoke all on function public.mcp_set_order_status_audited(uuid,text,text,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.mcp_set_order_status_audited(uuid,text,text,uuid,text,text) to service_role;
commit;
