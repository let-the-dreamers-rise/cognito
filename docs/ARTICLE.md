My mother lives alone, about a thousand kilometres from me.

I am not frightened every day. But some mornings I am, and the only thing I can
do about it is call her. That call is worse than useless, because whatever is
actually happening, she says the same four words: *sab theek hai*. Everything's
fine. She says it if she slept badly. She says it if she fell yesterday. She
says it because she does not want to be a burden, and because being asked "are
you okay?" every day is its own small insult.

So I have a question I cannot ask, and she has an answer she will always give.

## Why the obvious answers are wrong

I spent longer on this than on any code, because I kept finding that the
existing solutions solve a *different* problem.

**Location sharing** answers *where is she*. My question is *is she okay*, and
those come apart exactly when it matters. She is at home almost all the time.
The dot sits on the house whether she is making tea or lying on the bathroom
floor. Location is least informative precisely when risk is highest.

**Medical alert pendants** require her to press a button during the event. The
falls that matter are the ones where you cannot press anything. And a pendant
is a daily reminder that you are considered frail, which is why so many end up
in a drawer.

**Wearables** need charging, wearing, and a relationship with a device she
never asked for. My mother's phone is the only electronic object in her life
she uses without thinking.

**Monitoring apps** are the closest, and they fail for a subtler reason: they
give the family a dashboard. A dashboard hands the anxiety back to you and asks
you to interpret it. I do not want data about my mother. I want to stop
worrying for one more day.

That last sentence became the product thesis:

> This is not a monitoring product. It is a **relief** product. On 364 days out
> of 365 nothing happens, so the job is to make "nothing happened" legible.

One sentence a day:

> *"Amma's Friday looked normal. Up around 7:10, a trip to the shop, phone on
> charge by evening."*

There is not a single chart in the app.

## The technical problem: absence is not an event

My first architecture was the obvious one. The phone sends signals, a Lambda
receives them, and when something looks wrong we raise an alert. Ingest
function, DynamoDB table, done before lunch.

Then I tried to implement the actual rule: **"she hasn't got up yet."**

You cannot. There is no event. Nothing fires. The condition is defined entirely
by the *absence* of a message, and an event-driven system has nothing to attach
a handler to. My ingest function is invoked when things happen, and the thing I
need to notice is that nothing did.

This reads as obvious written down. It was not obvious while building, because
every instinct says *add a handler*. The correct framing is:

> Absence detection is not a handler problem. It is a **scheduling** problem.

So the heart of the system is a clock, not a listener:

```
EventBridge Rule (every 10 minutes)
   -> Sweep Lambda
        for each person: given what we know of THIS person,
                         is anything wrong right now?
        if yes -> start a Step Functions execution
```

Note *this person*. The threshold is not a population average. It is the median
of her own first-activity time over the last three weeks, plus a grace period.
My mother waking at 7:10 is unremarkable. It would be alarming for someone who
rises at 5:30.

## Two clocks, not one

My first version of "is anything wrong" compared the most recent signal of any
kind against a threshold. That is wrong, and the way it is wrong is the whole
point of the system.

A phone that is **switched off** has an ordinary explanation. Flat battery, left
in a drawer, travelling.

A phone that is **on, connected, and reporting for thirty hours while no human
has touched it** does not have an ordinary explanation. That is the frightening
case, and my single clock could not see it, because the phone was cheerfully
checking in the entire time.

So there are two:

| Clock | Meaning |
|---|---|
| `lastSeenAt` | any signal at all - *the phone is alive* |
| `lastWakingAt` | only a signal a person could make - *someone is there* |

A waking signal is a screen interaction, a step count, or a bank SMS timestamp.
That last one is the strongest signal in the product: a UPI payment at 8am means
she got up, got dressed, walked out and spoke to someone. The native module
reads only the *time* it arrived, never the message body.

The ladder reads both clocks:

```js
if (sinceWaking >= 48) return CRITICAL_48H;
if (sinceWaking >= 24) return CRITICAL_24H;
if (sinceDevice >= 12) return DEVICE_DARK;
if (sinceWaking >= 12) return SILENT_12H;
```

## Asking her first

When the sweep finds something, it starts a Step Functions execution:

1. **Nudge her** - a quiet notification on her phone.
2. Wait. Check whether she answered.
3. **Ring through** - louder, breaking past silent mode.
4. Wait. Check.
5. **Tell the family.**
6. Check whether that push was *actually delivered*.
7. **Text a registered neighbour.**

She is asked first, twice, before anyone else learns there was a question. Most
mornings it ends at step 2 and her family never knows. That single design
choice is the difference between a product people keep and one they uninstall,
because a system that cries wolf gets removed by the person it is meant to
protect - and then it protects nobody.

Two things I would reach for again immediately.

**A `Choice` at the top that skips the polite rungs.** Two days of silence is
not a social situation. Asking nicely is the wrong behaviour, so critical
severities bypass steps 1-4 and reach family and neighbour at once.

**The wait duration is an input to the execution, not baked into the machine.**

```ts
new sfn.Wait(this, 'WaitAfterNudge', {
  time: sfn.WaitTime.secondsPath('$.waitSeconds'),
})
```

Production waits twenty minutes a rung. My demo passes `waitSeconds: 6`. Same
state machine, same code path, no branch, and no test-only mode that can drift
from the real one. This one line lets me demonstrate a twenty-minute escalation
in ninety seconds while still demonstrating the real thing.

And the last rung is the one nobody builds. I am a thousand kilometres away and
can do nothing. The neighbour is forty feet away and can knock on the door.

## Six bugs, every one of them silent

Late on, I audited code that was already deployed and appeared to work. I found
six bugs. All six were invisible from outside, for the same structural reason:

> In a system whose job is to notice that nothing happened, a broken detector
> and a quiet day look identical.

- **A query sorted the wrong way.** I asked for "the first signal of the day"
  with `ScanIndexForward: false` and a limit, so I got the earliest of the
  *newest* 200. The nightly job learns her routine from exactly that value.
- **Summing a running total.** Step counts arrive as a cumulative daily figure
  resent every five minutes. I was adding them. A walk to the shop reported six
  figures.
- **Unclamped device clocks.** A phone running fast pushed `lastWakingAt` into
  the future, making every elapsed-time calculation negative, so no severity
  would ever fire for that person again. Permanently unwatched, no error.
- **`??` where I needed `||`.** An empty-string timestamp slipped past a
  nullish fallback into a helper that treats falsy as `Infinity`, so a blank
  clock read as infinitely stale and assessed the quietest person in the system
  as forty-eight hours silent. The loudest possible alarm, for nothing.
- **A permission nothing ever requested.** The SMS module was correct. No code
  anywhere asked for the permission, so it returned an empty list on every
  device forever, and a bare `catch` swallowed it.
- **No background task at all.** The libraries were installed and never wired
  up, so signals only flowed while the app was open. A woman who never opens
  the app looked exactly like a woman in trouble.

The lesson I actually took: **make the system report its own uncertainty.** The
ladder now reads per-message delivery receipts instead of trusting an HTTP 200,
and branches straight to the neighbour when a rung reached zero people.

## The honest part

The daily sentence is meant to come from Amazon Bedrock. The Converse call is
implemented, the IAM grant is real, and it is invoked live rather than replaced
with fixture text. It produces nothing on my account: `Model invocation max
tokens per day` reads `0` and is marked not adjustable, so every call returns
`ThrottlingException` across every model family and region I tried.

I could have hidden that. Instead the API returns `writtenBy: "bedrock" |
"fallback"` on every sentence, and a deterministic writer produces the text you
actually see.

One piece of feedback, since it cost me hours: the error says *"please wait
before trying again"*, which reads like ordinary rate limiting, so the SDK
retried three times and I assumed it was transient. It is not throttling, it is
a hard zero allowance, and waiting never helps. Naming the quota in the
exception would have turned an afternoon into a minute.

## What I would tell myself at the start

If the condition you care about is the absence of something, stop looking for
an event to handle. Reach for a scheduled sweep and a state machine, and spend
your design effort on the question the sweep asks rather than the plumbing
around it.

And if you are building anything whose success state is *nothing happened*,
assume your bugs are silent until you have proven otherwise. Mine all were.

---

*Built with AWS CDK in TypeScript: Lambda, DynamoDB, API Gateway, Step
Functions, EventBridge Rule and Scheduler, SNS, Bedrock, Amplify Hosting and
CloudWatch. The client is Expo React Native with a small Kotlin module that
reads bank-message timestamps and never requests the message body.*
