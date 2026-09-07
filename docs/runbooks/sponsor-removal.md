# Sponsor emergency-removal runbook

1. Resolve the sponsorship public ID and slot in the intended environment without printing payment or contact data.
2. Run the existing `phase2:remove-sponsor` command first as a dry run, then repeat with `--apply` only after verifying the isolated project/Production authority.
3. Confirm the runtime displays “Unsponsored · Sponsor a day,” the backpack patch is absent, and the redirect no longer leaves the site.
4. Preserve payment/webhook/audit records. Remove public creative only through the guarded workflow; do not delete evidence.
5. Notify the sponsor through the approved external support process and record UTC time/reason.
