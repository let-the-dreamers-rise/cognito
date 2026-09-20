# Submission draft

Everything here is written against what is **actually verified working**. Three
items are marked UPDATE BEFORE SUBMITTING because they may change in the last
few hours. Do not soften those into claims that are not true yet.

---

## Project title

**Sab Theek**

## Track

**Ship It** (deployed, with a URL)

## Links

- GitHub: https://github.com/let-the-dreamers-rise/cognito
- Deployed (web): https://main.d2qgbxnzjs5xxe.amplifyapp.com
- Android APK: https://expo.dev/artifacts/eas/F7Gj5QdMIMU_uN6qxR7gdrvD4JfhhQ2Ev9VjresiqoY.apk
- Demo video: _UPDATE BEFORE SUBMITTING_

**To look around without enrolling anyone:** choose *"Someone I love does"* and
enter the pairing code **`TRYME9`**. That mints a fresh sample family just for
you - your own isolated account, seeded with a week of ordinary days - and
unlocks the demo controls that can force a quiet morning or two days of
silence. Every other pairing code is somebody's actual mother, and on those the
demo controls do not exist: forcing an escalation there would send a real text
message to a real neighbour.

The APK is the real thing. The web build cannot read the phone's own signals -
no step count, no charging state, and no bank-message timestamps - so the web
URL shows the product's screens while the APK shows the product.

---

## What does your project do? (what problem, and who for)

Millions of Indian parents live alone while their children work a thousand
kilometres away. The child carries a low-grade daily fear with nowhere to put
it, and the only outlet is a phone call that is friction for both sides -
"haan beta, sab theek hai" tells you nothing at all.

Sab Theek answers one question, once a day, in one sentence: did today go
ordinarily? *"Amma's Friday looked normal. Up around 7:10, a trip to the shop,
phone on charge by evening."*

The distinction that drives every decision in it: **this is not a monitoring
product, it is a relief product.** On 364 days out of 365 nothing happens, so
the job is to make "nothing happened" legible. A dashboard transfers anxiety; a
sentence resolves it. There is not a single chart in the app.

It is also not location sharing. Location answers *where is she*; the real
question is *is she okay*. A map pin is least useful exactly when risk is
highest - she is at home, the dot sits on the house all day, and it looks
identical whether she is making tea or lying on the bathroom floor. Routine is
evidence of wellbeing. Position is not.

When a day is not ordinary, it asks her first - twice, quietly - and most
mornings that ends it and the family never learns there was a question. Only
silence escalates. And past a threshold the politeness stops: two days without
a human touching the phone skips the gentle rungs entirely and reaches the
family and a registered neighbour at once, because the family is a thousand
kilometres away and the neighbour is forty feet away and can knock.

For: adult children of parents living alone. The buyer is the anxious child;
the user whose phone it runs on is the parent. Nobody else builds for that
split, and it is the whole product.

---

## How did you use AWS? (Ship It - services)

Lead with this line, because it is the architectural point:

> **The hardest event in this system is the one that never arrives.** You
> cannot detect absence with an event handler - you need a clock that fires
> when an expected signal *did not* come. That is why this is an event-driven
> system on AWS rather than a request-response app with a chatbot bolted on.

| Service | What it does here |
|---|---|
| **API Gateway** (HTTP API) | Heartbeat ingest, pulse queries, enrolment, stand-down |
| **Lambda** (8 functions, ARM64, Node 22) | All application logic |
| **DynamoDB** | Single table, single-table design with a GSI; raw signals carry a TTL so the trail expires while the verdict survives |
| **EventBridge Rule** | The absence sweep every 10 minutes - the clock the entire system turns on |
| **EventBridge Scheduler** | The nightly sentence at 21:00, in her own timezone |
| **Step Functions** | The escalation ladder: wait states, per-execution wait durations, and a Choice at the top that routes critical cases past the polite rungs |
| **Bedrock** (Amazon Nova Lite) | The daily sentence. See the note below: the call is wired and live, but this account's daily token quota is `0`, so what you will see is the deterministic fallback |
| **SNS** | SMS to the neighbour, who will not have the app installed |
| **Amplify Hosting** | The Expo web build - the deployed URL |
| **CloudWatch** | Logs and metrics |
| **IAM** | Least-privilege per-function roles via CDK grants |

Infrastructure is **AWS CDK in TypeScript**, same language as the app.

Why Nova rather than Anthropic on Bedrock: Anthropic models require a use-case
form per account, which a judge cloning this repo would hit too. Nova needs no
form, and one short sentence per person per day does not need a frontier model.

**On Bedrock, plainly.** The Converse call is implemented, granted, and invoked
live by the demo seed rather than replaced with fixture text. It does not
produce anything on this account: `Model invocation max tokens per day for
Amazon Nova Lite` reads `0` and is marked not adjustable, so every call returns
`ThrottlingException: Too many tokens per day` in every region tried. Rather
than hide that, the seed endpoint returns `writtenBy: "bedrock" | "fallback"`
so anyone can see which wrote the sentence. On an account with a token
allowance this path works unchanged; on this one, the deterministic writer
produces every sentence in the demo.

---

## Learning and growth

First time using **Step Functions**, and the reason it is here is a genuine
lesson rather than a checkbox: I started by trying to detect "she hasn't got
up" with an event handler, and it cannot be done. Absence is not an event. Once
that clicked, EventBridge Scheduler arming a Step Functions ladder with wait
states stopped being an AWS service I was supposed to use and became the only
correct shape for the problem. First time with EventBridge Scheduler, Bedrock
Converse, and CDK for Step Functions definitions.

The harder lesson was about my own code. Late in the build I audited what was
already deployed and found four live bugs, none visible from outside:

- A DynamoDB Query used `ScanIndexForward: false` with a limit, so "the first
  signal of the day" was really the earliest of the *newest* 200 - and the
  nightly job teaches the baseline from exactly that value.
- Step counts arrive as a running daily total resent every five minutes, and I
  was summing them. A walk to the shop reported six figures.
- Device timestamps were never clamped to now, so a phone with a fast clock
  would put the waking clock in the future and silence that person's sweep
  permanently.
- The native SMS module resolved through a deprecated Expo API that returns
  undefined under the new architecture, and the failure was swallowed by a bare
  catch - so the signal could appear to work while never once firing.

The pattern across all four is the same: in a system whose job is to notice
nothing happening, every bug is silent by construction. That is now the thing I
design against.

---

## Team leader's contributions

Solo build. Product definition, AWS architecture and CDK infrastructure,
all eight Lambda handlers, the Step Functions escalation ladder, the DynamoDB
single-table design, the Expo app for both roles, the Android native module,
the test suite over the severity and baseline logic, and deployment.

---

## The 3-minute video

No live demo, so this is what the judges see. Record the screen; speak over it.

| Time | Beat |
|---|---|
| **0:00-0:20** | Say the real thing, plainly. "My parents live 1,500km from me. I'm not scared every day, but some days I am, and calling to ask doesn't help because she'll say sab theek hai whatever is happening." No slides. |
| **0:20-0:50** | The ordinary day. Open the app: one sentence. *"Amma's Friday looked normal."* Show the week strip. Say: a dashboard transfers anxiety, a sentence resolves it - that's why there's no chart in this app. |
| **0:50-1:05** | Kill the obvious objection before a judge thinks it. "You'd ask why not just share location." Show that a pin looks identical whether she's making tea or on the bathroom floor. |
| **1:05-1:45** | **The money shot.** Hit "Run a quiet morning". It asks *her* first, on her phone. She taps. Nothing reaches the family. Say: most mornings end here and you never knew there was a question - that's what stops it crying wolf. |
| **1:45-2:10** | Now "Run two days of silence". No nudge, no waiting - family and the neighbour at once. Land the line: you are 1,500km away and can do nothing; the neighbour is forty feet away and can knock. |
| **2:10-2:40** | Architecture. Show the Step Functions graph mid-execution. "The hardest event here is the one that never arrives - you can't catch absence with an event handler." Name EventBridge, Step Functions, DynamoDB, Bedrock, SNS. Show the two clocks: phone-is-on versus a-person-is-there. |
| **2:40-3:00** | Learning, and be honest about a limit. The four silent bugs line. Then: "Everything in this video is running on AWS right now; here's the URL." |

**Rules for the recording:** no intro animation, no music bed under speech, no
reading the README aloud. Screen-record at phone aspect for the app and desktop
for the state machine. If something is simulated, say so in the video - judges
who have built this notice, and honesty about a limit scores better than a
claim that does not survive a question.

---

## Before you submit - check these are still true

- [x] Does the daily sentence come from Bedrock, or the template fallback?
      **The fallback.** Account quota is `0` tokens/day and not adjustable.
      Stated plainly in the README and above; the API reports `writtenBy`.
- [x] Has a push notification actually landed on a physical phone? **Yes.**
      FCM V1 credentials are configured and a real device registered
      ExponentPushToken[...] at 17:40 UTC. The nudge arrives on the lock
      screen and tapping it stands the ladder down.
- [x] Has the Android build been compiled? **Yes.** The native SMS module
      builds cleanly on EAS; APK linked above. Whether it has been *installed*
      and exercised on a physical handset is the line below.
- [ ] Blog published on AWS Builder Center and linked (top 5 blogs win a
      keyboard; this is close to free given the build notes already exist)
- [ ] Resume link is public - it is required for the Amazon fast-track
