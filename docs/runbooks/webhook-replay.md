# Webhook inspection and replay runbook

Real provider payloads are sensitive. Use provider event IDs and checksums in operational output, never raw payloads.

1. Confirm Lemon Squeezy test/live mode, environment and expected sponsorship correlation.
2. Inspect `payment_webhook_events` by stable provider event ID. A matching processed checksum is idempotent; a different checksum under the same identity is rejected.
3. Use `phase2:replay-webhook` without `--apply` to inspect the proposed operation.
4. Replay only failed/reclaimable events with explicit environment confirmation. Record the action in `webhook_replay_audit`.
5. Confirm no duplicate sponsorship, payment, slot or sponsor-metric record was created.

Production replay remains blocked until real test-mode duplicate delivery has passed and the product owner authorizes launch operations.
