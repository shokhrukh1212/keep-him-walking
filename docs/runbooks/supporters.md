# Manual supporter acknowledgments

Until direct Buy Me a Coffee sync is available, the public list is maintained in
`src/content/supporters.ts`. It starts empty on purpose.

Before adding anyone, obtain their permission to be named on Keep Him Walking. Add only a
public display name, the contribution date and an exact coffee count when it is known. Leave
`coffeeCount` as `null` when it is not known; never infer it from an amount. Do not add an
email address, payment identifier, private message or anonymous supporter.

Append the record in chronological order:

```ts
{ id: "supporter-001", occurredAt: "2034-01-02T10:00:00Z", displayName: "Alex", coffeeCount: 3 }
```

An X or startup URL may be included only after the owner has verified it. Run `pnpm verify`
before deploying. To correct or remove an acknowledgment, edit or delete that public record,
then redeploy.
