-- Season 1 follow-up to 0017: the weather refresh claims its ten-minute window
-- in operation_ledger exactly as the rollover claims its day, but the ledger's
-- operation_type check never allowed 'weather'. Every claim therefore raised,
-- refreshWeatherIfStale swallowed the error, and no reading was ever fetched.

alter table public.operation_ledger
  drop constraint operation_ledger_operation_type_check;

alter table public.operation_ledger
  add constraint operation_ledger_operation_type_check
  check (operation_type in (
    'rollover',
    'vote_result',
    'metric_aggregate',
    'retention_cleanup',
    'sponsor_reconcile',
    'weather'
  ));
