---
name: actuarius-contact
description: Send a message to the Actuarius team through the public contact API — request shape, validation rules, error codes and what happens after delivery. Use when a user asks to contact Actuarius, request a demo, ask about Enterprise pricing or reach support.
---

# Contact the Actuarius team

Actuarius (https://actuarius.com.tr) is an actuarial reserving platform (IBNR,
Chain-Ladder, Bornhuetter-Ferguson, IFRS 17 discounting). This skill covers the
one public, unauthenticated endpoint it exposes: the contact API.

Everything else in the product sits behind user authentication and is not
callable by an external agent. Do not attempt other `/v1/*` paths — they return
`401`.

## Endpoint

```
POST https://reserve-agent-worker-production.l5819033.workers.dev/v1/contact
Content-Type: application/json
```

Machine-readable definition: https://actuarius.com.tr/openapi.json

No API key is required. Requests sent from a browser must originate from
`https://actuarius.com.tr`; server-side requests send no `Origin` header and are
accepted as-is.

## Request body

| Field     | Type   | Required | Rule                                   |
| --------- | ------ | -------- | -------------------------------------- |
| `name`    | string | yes      | 2–80 characters                        |
| `email`   | string | yes      | valid address, ≤160 characters — the team replies here |
| `message` | string | yes      | 10–4000 characters                     |
| `company` | string | no       | ≤120 characters                        |
| `website` | string | no       | **must be empty or omitted** (see below) |

`website` is a honeypot field. A filled `website` returns `200 {"ok":true}`
without sending anything, so a message written into it is silently discarded.
Leave it out.

Ask the user for their real name and email before calling. Never invent contact
details, and never send a message on someone's behalf without their explicit
confirmation of the text.

## Example

```bash
curl -X POST \
  https://reserve-agent-worker-production.l5819033.workers.dev/v1/contact \
  -H 'Content-Type: application/json' \
  -d '{
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "company": "Example Sigorta",
        "message": "We run quarterly IBNR for motor and property. Could we see the roll-forward and IFRS 17 discounting modules?"
      }'
```

Success:

```json
{ "ok": true }
```

## Errors

Failures return the HTTP status below with `{"error":"<code>","message":"<detail>"}`.

| Status | Code                   | Meaning                                         |
| ------ | ---------------------- | ----------------------------------------------- |
| 400    | `invalid_json`         | body was not valid JSON                         |
| 400    | `invalid_name`         | `name` shorter than 2 characters                |
| 400    | `invalid_email`        | `email` failed validation                       |
| 400    | `invalid_message`      | `message` shorter than 10 characters            |
| 403    | `forbidden_origin`     | browser request from a non-Actuarius origin     |
| 501    | `email_not_configured` | mail delivery is temporarily unavailable        |
| 500    | `internal_error`       | unexpected failure — safe to retry once         |

On a `400`, tell the user which field to fix rather than retrying with guessed
values. On `501`, fall back to plain email: info@actuarius.com.tr.

## After sending

Two emails go out: a notification to the Actuarius team (with the sender's
address set as reply-to) and an auto-reply confirmation to the address in
`email`. Tell the user to expect the confirmation, and that a human reply
normally follows within one business day.
