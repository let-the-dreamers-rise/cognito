# Absence is not an event

## What I learned building a system whose most important signal is the one that never arrives

My parents live about a thousand kilometres from me. I'm not frightened every
day. But some mornings I am, and calling to ask doesn't help, because whatever
is actually happening, my mother says *sab theek hai*. Everything's fine.

So I built the thing I actually wanted. Not a dashboard. One sentence a day:

> *"Amma's Friday looked normal. Up around 7:10, a trip to the shop, phone on
> charge by evening."*

This post is not about the product. It's about the one architectural problem at
the centre of it, which took me embarrassingly long to see, and about six bugs
I found in my own already-deployed code that were all invisible for the same
reason.

---

## The mistake: trying to catch nothing with an event handler

My first design was the obvious one. Phone sends signals; backend receives
signals; when something looks wrong, raise an alert. Ingest Lambda, DynamoDB,
done before lunch.

Then I tried to write the rule *"she hasn't got up yet."*

You cannot. There is no event. Nothing fires. The entire condition I care about
is defined by the **absence** of a message, and an event-driven system has
nothing to hang a handler on. My ingest Lambda is invoked when things happen,
and the thing I need to notice is precisely that nothing did.

This sounds trivial written down. It was not obvious while building, because
every instinct says "add a handler." The correct answer is that absence
detection is not a handler problem, it's a **scheduling** problem. You need
something that runs when nothing has happened, looks at the clock, and asks a
question.

Once that clicked, the architecture fell out of it:

```
EventBridge Rule (every 10 min)
        -> Sweep Lambda
              for each person: is anything wrong right now?
              if yes -> Step Functions execution
```

The sweep is the heart of the system, and it is a **clock**, not a listener.

---

## The second mistake: one clock where there were two

My first version of "is anything wrong" compared `lastSeenAt` - the timestamp
of the most recent signal of any kind - against a threshold.

That's wrong, and the way it's wrong matters.

A phone that is switched off has an ordinary explanation. It's out of battery,
it's in a drawer, she's travelling. A phone that is **on, connected, and
reporting for thirty hours while no human has touched it** does not have an
ordinary explanation. That is the alarming case, and my single clock could not
see it, because the phone was cheerfully checking in the whole time.

So there are two clocks:

- `lastSeenAt` - any signal at all. *The phone is alive.*
- `lastWakingAt` - only a signal a person could produce: screen interaction,
  step count, a UPI payment. *Someone is there.*

The severity ladder reads both:

```js
if (sinceWaking >= 48) return CRITICAL_48H;
if (sinceWaking >= 24) return CRITICAL_24H;
if (sinceDevice >= 12) return DEVICE_DARK;
if (sinceWaking >= 12) return SILENT_12H;
```

Conflating those two into one number was the single worst decision in the first
draft, and it would have made the product quietly useless in exactly the
situation it exists for.

---

## Why Step Functions, and the trick I'd use again

When the sweep decides something is wrong, it starts a Step Functions
execution. The ladder is:

1. Ask **her** - a gentle nudge on her phone.
2. Wait. Check whether she answered.
3. Ask again, louder, breaking through silent mode.
4. Wait. Check.
5. Tell the family.
6. Check whether the family push was *actually delivered*.
7. Text a registered neighbour.

She is asked first, twice, before anyone else learns there was a question. Most
mornings it ends at step 2 and the family never knows. That is the whole
difference between a product people keep and one they uninstall, because a
system that cries wolf gets removed by the person it's meant to protect, and
then it protects nobody.

Two things I'd reach for again immediately:

**A `Choice` at the top that routes past the polite rungs.** Two days of
silence is not a social situation. Asking nicely is the wrong behaviour, so
critical severities skip steps 1 to 4 entirely and hit family and neighbour at
once. That's a state machine branch, not an `if` buried in a Lambda.

**The wait duration is an input to the execution, not baked into the machine.**

```ts
new sfn.Wait(this, 'WaitAfterNudge', {
  time: sfn.WaitTime.secondsPath('$.waitSeconds'),
})
```

Production waits twenty minutes a rung. My demo passes `waitSeconds: 6`. Same
state machine, same code path, no branch, no test-only mode that might drift
from the real one. This one line is why I can demo a twenty-minute escalation
in ninety seconds and still be demonstrating the real thing.

---

## Six bugs, all of them silent

Late in the build I audited code that was already deployed and appeared to
work. I found six bugs. Every single one was invisible from the outside, and
they were invisible for the same structural reason:

> **In a system whose job is to notice that nothing happened, a broken detector
> and a quiet day look identical.**

1. **A DynamoDB query with the wrong sort order.** I asked for "the first
   signal of the day" with `ScanIndexForward: false` and a limit - so I got the
   earliest of the *newest* 200. The nightly job learns her routine from
   exactly that value, so the baseline was quietly wrong.

2. **Summing a running total.** Step counts arrive as a cumulative daily figure
   resent every five minutes. I was adding them up. A walk to the shop reported
   six figures.

3. **Unclamped device timestamps.** One phone with a fast clock would push
   `lastWakingAt` into the future, making every elapsed-time calculation
   negative, so no severity would ever fire for that person again. Permanently
   unwatched, no error anywhere.

4. **`??` where I needed `||`.** An empty-string timestamp slipped past a
   nullish fallback into a helper that treats falsy as `Infinity` - so a blank
   clock read as infinitely stale and assessed the quietest person in the
   system as 48 hours silent. The loudest possible alarm, for nothing.

5. **A permission nothing ever requested.** The strongest waking signal I have
   is a bank SMS timestamp - a payment at 8am means she got up, got dressed,
   walked out and spoke to someone. The native module read it correctly. No
   code anywhere ever asked for the permission, so it returned an empty list on
   every device, forever, and a `catch` swallowed it.

6. **No background task at all.** The libraries were installed and never wired
   up, so signals only flowed while the app was open. A woman who never opens
   the app looked exactly like a woman in trouble.

What I took from this: **build the system so it reports its own uncertainty.**
The escalation ladder now reads per-message delivery receipts from the push
service instead of trusting a 200, and branches straight to the neighbour when
a rung reached zero people. The API returns which engine wrote each daily
sentence rather than letting a fallback pass as the real thing. If a component
can fail quietly, make it say so out loud.

---

## The honest part

The daily sentence is meant to come from Amazon Bedrock. The Converse call is
implemented, the IAM grant is real, and it is invoked live rather than replaced
with fixture text. It produces nothing on my account: `Model invocation max
tokens per day` reads `0` and is marked not adjustable, so every call returns
`ThrottlingException: Too many tokens per day` in every region I tried, across
seven model families.

I could have hidden that. Instead the API returns `writtenBy: "bedrock" |
"fallback"` on every sentence, and a deterministic writer produces the text you
actually see.

One piece of feedback for that team, since it cost me hours: the error says
*"please wait before trying again,"* which reads like ordinary rate limiting.
The SDK dutifully retried three times. It is not throttling, it's a hard zero
allowance, and waiting never helps. Naming the quota in the exception would
have turned an afternoon into a minute.

---

## What I'd tell myself at the start

If the condition you care about is the absence of something, stop looking for
an event to handle. Reach for a scheduled sweep and a state machine, and spend
your design effort on the question the sweep asks rather than on the plumbing
around it.

And if you're building anything whose success state is "nothing happened,"
assume your bugs are silent until you have proven otherwise. Mine all were.

---

*Built with AWS CDK in TypeScript: Lambda, DynamoDB, API Gateway, Step
Functions, EventBridge Rule and Scheduler, SNS, Bedrock, Amplify Hosting and
CloudWatch. The app is Expo React Native with a small Kotlin module that reads
bank-message timestamps and never requests the message body.*
