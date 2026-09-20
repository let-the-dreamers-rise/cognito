# Sab Theek

**Knowing today was an ordinary day.**

Millions of Indian parents live alone while their children work a thousand
kilometres away. The child carries a low-grade daily fear with nowhere to put
it, and the only outlet is a phone call that is friction for both sides -
*"haan beta, sab theek hai"* tells you nothing.

**Try it.** Android APK (install on the phone itself, allow unknown sources):
<https://expo.dev/artifacts/eas/T_MyxwO-Hfvypy-dpPLbMOjc6aqeduTYA8d7cyPjXhE.apk>
Web: <https://main.d2qgbxnzjs5xxe.amplifyapp.com>

The APK is the real thing. The web build has no step count, no charging state
and no bank-message timestamps, so it shows the screens rather than the product.

Sab Theek answers one question, once a day, in one sentence:

> *"Amma's Friday looked normal. Up around 7:10, a trip to the shop, phone on
> charge by evening."*

---

## This is not a monitoring product

That distinction drives every decision in this repo.

**A dashboard transfers anxiety. A sentence resolves it.** So there is not a
single chart in the app. The watcher receives a derived verdict and never the
underlying signal trail.

### Why not just share location?

Because location answers *where is she*, and the real question is *is she okay*.
A map pin is at its most useless exactly when risk is highest: she is at home,
the dot sits on the house all day, and it looks identical whether she is making
tea or lying on the bathroom floor.

Routine is evidence of wellbeing. Position is not.

### Why this cannot be used to follow someone

Passive routine awareness has the same shape as intimate-partner surveillance,
so the design refuses precision on purpose:

| Rule | Why |
|---|---|
| **Derived verdicts only, never raw signals** | An abuser needs precision. The maximum output is one sentence a day, which is useless for following anyone. |
| **It cannot be hidden** | Stalkerware's defining property is covertness. Permanent presence on her phone, no stealth mode. |
| **The watched person enrols first** | She installs it and hands out the pairing code. Nobody can add themselves to someone else's account. |
| **She holds the tap, unilaterally** | Pause any time, no approval. The family is told *"she paused sharing"* - never *"she is hiding something"*. |
| **No location, ever** | Not collected, not stored, not offered. |

### What is collected, and what is refused

**Collected:** phone picked up (and when) - approximate steps - phone put on
charge - *that* a payment happened, timestamp only.

**Refused:** location - message content - call records or content - camera or
microphone - per-app usage - payment amounts, merchants, or any message body.

The test for any new signal: *does it change the daily verdict?* If not, it is
noise, and noise is what turns relief into surveillance.

---

## Architecture

**The hardest event in this system is the one that never arrives.**

You cannot detect absence with an event handler. You need a clock that fires
when an expected signal *did not* come - which is why this is an event-driven
system on AWS rather than a request-response app.

```
Expo app (parent)  --heartbeat-->  API Gateway  -->  Lambda  -->  DynamoDB
                                                                     |
                       EventBridge Rule (every 10 min) --> Sweep Lambda
                                   "is anything wrong right now?"
                                                                     |
                                                      Step Functions ladder
                                                                     |
                                      how serious? ------------------+
                                            |                        |
                              ordinary      |                        | critical
                                            v                        v
              nudge -> wait -> ring -> wait -> family      family + neighbour,
                        -> wait -> SMS neighbour (SNS)     immediately, no waiting

       EventBridge Scheduler (21:00 Asia/Kolkata) --> Summarize Lambda --> Bedrock
                                    one warm sentence, pushed to the family
```

| Service | Doing what |
|---|---|
| **API Gateway (HTTP API)** | Heartbeat ingest, pulse queries, enrolment |
| **Lambda** (7 functions, ARM64) | All application logic |
| **DynamoDB** | Single table; raw signals carry a TTL so the trail expires |
| **EventBridge Rule** | The absence sweep - the clock the whole system turns on |
| **EventBridge Scheduler** | The nightly sentence, in her timezone |
| **Step Functions** | The escalation ladder, with per-execution wait times |
| **Bedrock** | The daily sentence, with a deterministic template fallback |
| **SNS** | SMS to the local contact, who will not have the app |
| **Amplify Hosting** | The Expo web build |

### Two clocks, not one

The central idea. Most of these systems track "last activity" as a single
number, which quietly conflates two very different situations:

- **`lastSeenAt`** - any signal at all. Proves the phone is on and has network.
- **`lastWakingAt`** - a signal only a person makes. Proves someone is there.

A phone that is switched off has an ordinary explanation. A phone that is on,
charged, reporting in every five minutes, and *untouched for a day* does not.
The second case is the more alarming one, and a single clock cannot see it.

### How worried to be

Severity decides how politely the system behaves, and that is the whole design.

| Severity | Condition | What happens |
|---|---|---|
| `late` | No waking signal by her usual time + 2h grace | Ask her, twice, 20 min apart. Family only if she stays silent. |
| `silent12` | Untouched for 12 hours | Same ladder, 10 min apart |
| `deviceDark` | Phone off or out of signal 12h+ | Same ladder, 10 min apart |
| `critical24` | Untouched since yesterday | **Skips the polite rungs.** Family and neighbour at once. |
| `critical48` | Untouched for two days | **Skips the polite rungs.** Family and neighbour at once. |

For an ordinary late morning, asking her first is right: most days the first
nudge ends it and the family never learns there was a question, which is what
stops the false-alarm spiral that kills products in this category.

Above a threshold that politeness becomes wrong. **A day of silence is not a
social situation**, so the state machine branches at the top and goes straight
to whoever can physically reach her. An incident that gets worse re-raises
itself rather than staying quiet because something is already open.

### The rung nobody else builds

The last step is not "alert the family harder". It is an SMS to a neighbour.
The family is a thousand kilometres away and can do nothing; the neighbour is
forty feet away and can knock.

---

## Running it

```bash
cd infra && npm install && (cd lambda && npm install)
npx cdk bootstrap && npx cdk deploy
```

Take `ApiUrl` from the stack outputs, then:

```bash
cd app && npm install
EXPO_PUBLIC_API_URL=<ApiUrl> npx expo start
```

Web build for Amplify Hosting:

```bash
cd app && npx expo export --platform web
```

---

## What a late audit found

With a day left I stopped adding features and audited what was already
deployed. It found eight live bugs, and **every one of them was silent** - the
system reported success while doing the wrong thing. In a product whose job is
to notice that nothing happened, that is not a coincidence: the absence of an
error is exactly what normal looks like, so a broken detector and a quiet week
are indistinguishable from the outside.

The four that could make the system stop watching someone entirely:

- **A stranded incident retired a member permanently.** The sweep skips anyone
  with an open incident. No rung had a catch, so one DynamoDB blip mid-ladder
  left the incident open forever - and that member was then skipped every ten
  minutes, logged at info, reported as success. If the stranded incident was
  critical, nothing could ever raise them again. Now rungs catch, incidents age
  out after the state machine's own timeout, and the next sweep reopens.
- **The ladder failed open into silence.** `checkResponded` asked whether the
  status was anything other than `open`, so a missing record read as *she
  answered* and the escalation ended having told nobody. An unknown state must
  escalate, never reassure.
- **Incident ids were random UUIDs**, but every reader asks DynamoDB for the
  newest few and DynamoDB sorts lexically. Past five lifetime incidents,
  "the open incident" became an arbitrary pick - so a sign of life could fail
  to close the very incident it disproved. Ids are now time-ordered.
- **A worsening case started a second ladder without stopping the first**, so
  two executions nudged, rang and texted the neighbour independently for one
  absence. The earlier one is now superseded and stopped.

And four that quietly corrupted the data the model runs on: a query that read
newest-first with a limit, so "the first signal of the day" was the earliest of
the most recent 200 - and the nightly job learns the baseline from exactly that
value; step counts summed instead of maxed, turning a walk to the shop into six
figures; device timestamps never clamped, so one fast clock put the waking
clock in the future and silenced that member for good; and a native module
resolved through a deprecated API that returns undefined, swallowed by a bare
catch, so a signal could appear to work while never once firing.

## Honest limitations

These are real and stated deliberately rather than hidden.

- **There is no alarming.** If the sweep Lambda started throwing, nothing would
  tell anyone. The right answer is not a dashboard, it is a synthetic canary
  member that is never fed signals and therefore escalates every single day:
  if its daily escalation stops arriving, the whole path is broken. Silence
  from the canary is the alarm. That is the only monitor that tests what this
  product actually promises.
- **The sweep is O(all members) every ten minutes**, against a GSI whose
  partition key is the constant `ALL_MEMBERS` - one physical DynamoDB
  partition, and every heartbeat replicates a write into it. Correct to roughly
  10k members. The fix is a sharded due-index (`gsi1pk = DUE#<shard>`,
  `gsi1sk = nextCheckDueAt`) so the sweep reads only the members actually at
  risk rather than all of them.
- **Notification delivery is better than best-effort but not yet reliable.**
  Expo tickets are now parsed, and a rung that reaches nobody hands straight to
  the neighbour instead of waiting. But receipts are not polled, dead tokens
  are not reaped, and **a watcher's push token cannot be refreshed after
  enrolment** - so the day a family member reinstalls the app, that rung stops
  reaching them. Production needs SQS with a DLQ and receipt polling.
- **SMS to Indian numbers needs TRAI DLT registration.** SNS returns a message
  id and the carrier drops it. The neighbour rung - the part of this design I
  am proudest of - does not work in India without that paperwork, and it fails
  silently.
- **Pairing codes are not rate limited.** Six characters from a 25-character
  alphabet, and the API endpoint ships in the public bundle. A patient script
  could eventually become someone's watcher.
- **Single region, `us-east-1`, no staging.** `ap-south-1` is right for Indian
  families and for DPDP residency; it would also mean swapping the Nova
  inference profile from the `us.` to the `apac.` prefix.
- **Background reporting is at Android's mercy.** The phone reports itself every
  fifteen minutes through `expo-background-fetch`, which is the platform floor,
  and Doze stretches it much further on a phone that sits on a table all
  morning. That is tolerable because the question is "has the phone been used
  today", not "is it in her hand right now" - but it means the `late` rung can
  fire on a phone that was simply not woken yet. A foreground service would be
  honest about what this is, at the cost of a permanent notification on her
  screen, which is its own kind of dishonesty about what the product is for.
- **Bedrock is wired but produces nothing on this account.** The Converse call
  is real, the IAM grant is real, and the demo seed invokes it live rather than
  serving fixture text. The account's `Model invocation max tokens per day` quota
  for Nova Lite reads `0`, and it is not adjustable through Service Quotas, so
  every call returns `ThrottlingException: Too many tokens per day` and falls
  through to the deterministic writer. Every sentence you see in this demo was
  written by that fallback. The API says so in its own response - the seed
  returns `writtenBy: "bedrock" | "fallback"` - because a product whose thesis
  is one honest sentence should not let a template pass as a model's work.
- **Cost is not where you would guess.** Bedrock is about $0.60/month at a
  thousand families. The expense is DynamoDB writes, and most of those rows
  were heartbeats that nothing ever read - which is why heartbeats are no
  longer persisted at all.

- **The UPI signal needs a native Android module.** Reading transaction SMS is
  not reachable from managed Expo. The module is scoped to emit
  `{type: 'transaction', ts}` with the body discarded on-device, and is not
  wired up in this build. Nothing in the demo fakes it.
- **Auth is pairing codes plus opaque device tokens, not Cognito.** Correct for
  a four-day build, not for production.
- **The core assumption is unvalidated.** Whether passive routine signals are
  predictive enough to be useful without being noisy is an empirical question
  that four days cannot answer. It is the first thing to test with real
  families.
- **Background reporting on Android is throttled.** A foreground service would
  be the production answer.
