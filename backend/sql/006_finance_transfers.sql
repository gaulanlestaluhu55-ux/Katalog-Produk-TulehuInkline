-- TULEHU INKLINE - 006_finance_transfers
-- Additive metadata for paired internal-account transfers and reversals.

alter table public.finance_transactions
  add column if not exists transfer_id uuid,
  add column if not exists akun_lawan text default '',
  add column if not exists transfer_reversal_of uuid;

create index if not exists idx_finance_transfer_id
  on public.finance_transactions(transfer_id)
  where transfer_id is not null;

create index if not exists idx_finance_transfer_reversal
  on public.finance_transactions(transfer_reversal_of)
  where transfer_reversal_of is not null;

-- Verification: each live transfer must have exactly two ledger rows.
-- select transfer_id, count(*) as rows, sum(case when tipe = 'Masuk' then nominal else -nominal end) as net
-- from public.finance_transactions
-- where sumber = 'Transfer' and transfer_id is not null
-- group by transfer_id
-- having count(*) <> 2 or abs(sum(case when tipe = 'Masuk' then nominal else -nominal end)) > 0.01;
