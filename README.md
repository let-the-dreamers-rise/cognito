# Sab Theek

**Knowing today was an ordinary day.**

Millions of Indian parents live alone while their children work a thousand
kilometres away. The child carries a low-grade daily fear with nowhere to put
it, and the only outlet is a phone call that is friction for both sides -
*"haan beta, sab theek hai"* tells you nothing.

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

## Honest limitations

These are real and stated deliberately rather than hidden.

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
