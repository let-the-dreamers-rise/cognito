# Absence is not an event

My parents live a thousand kilometres from me. Some mornings I'm frightened,
and calling doesn't help: whatever is happening, my mother says *sab theek
hai*. Everything's fine.

So I built one sentence a day: *"Amma's Friday looked normal. Up around 7:10, a
trip to the shop, phone on charge by evening."*

**The mistake.** First design: phone sends signals, backend receives them,
raise an alert when something looks wrong. Then I tried to write *"she hasn't
got up yet."*

You can't. There is no event. Nothing fires. The condition I care about is
defined by the **absence** of a message, and an event-driven system has nothing
to hang a handler on. Absence isn't a handler problem, it's a scheduling
problem. An EventBridge rule sweeps every ten minutes and asks one question per
person. The heart of the system is a clock, not a listener.

**Two clocks, not one.** I first compared "last signal of any kind" against a
threshold. Dangerously wrong. A phone that's switched off has an ordinary
explanation. A phone that is on, connected and reporting for thirty hours while
no human has touched it does not — and my single clock couldn't see it, because
the phone was checking in the whole time. So: `lastSeenAt` (the phone is alive)
and `lastWakingAt` (someone is there).

**A Step Functions trick.** When the sweep finds something it starts a ladder:
ask *her* first, twice, before anyone else learns there was a question — most
mornings it ends there and the family never knows. The wait between rungs is an
input to the execution, not baked in:

```ts
time: sfn.WaitTime.secondsPath('$.waitSeconds')
```

Production waits twenty minutes a rung; my demo passes `6`. Same state machine,
no branch, no test-only mode that drifts from the real one.

**Six silent bugs.** I audited already-deployed code and found six. Every one
was invisible, for the same structural reason: *in a system whose job is to
notice that nothing happened, a broken detector and a quiet day look
identical.* A query sorted the wrong way, so the baseline learned from the
wrong timestamp. Cumulative step counts summed into six figures. An unclamped
device clock pushed a timestamp into the future and silenced that person
forever. `??` where I needed `||`, so a blank clock read as `Infinity` hours
and raised the loudest alarm on the quietest person. A permission nothing ever
requested. A background task never registered.

The lesson: make systems report their own uncertainty. The ladder now reads
delivery receipts instead of trusting a 200, and branches to a neighbour when a
rung reached nobody.

**Honestly:** Bedrock writes that sentence and the Converse call is live, but
my account's daily token quota is 0 and not adjustable, so a deterministic
fallback produces what you see. The API returns which one wrote it. The error
says "please wait before trying again", which reads like rate limiting; it
isn't, and waiting never helps.

CDK, Lambda, DynamoDB, Step Functions, EventBridge, SNS, Amplify.
