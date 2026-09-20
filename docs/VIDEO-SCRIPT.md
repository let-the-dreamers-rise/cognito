# Three minutes, word for word

Read the **Say this** lines aloud. Everything in *italics* is what you do on
screen, not something you read out.

Speak slower than feels natural. Do not apologise, do not say "basically",
do not say "so yeah". If you fluff a line, stop, breathe, say it again from the
start of that line - you can cut it.

---

## Before you hit record

Have these open and already loaded, so nothing loads on camera:

1. **Browser tab 1** - the app, already paired to a demo family via `TRYME9`,
   sitting on the family screen with a seeded week showing.
2. **Browser tab 2** - the AWS console on the Step Functions page for
   `EscalationLadder`, execution list open.
3. **Your phone** - Sab Theek installed, set up as "I live on my own",
   notifications allowed, practice alerts turned on, screen **locked**.
4. **Browser tab 3** - the app in a second browser profile, paired to your
   phone's real code, demo controls visible.

If the phone push does not land within about twenty seconds when you rehearse,
**cut the phone entirely** and do the whole demo in tab 1. Plan B is at the
bottom. A clean three minutes beats a brave failure.

---

## 0:00 - 0:25   The problem

*No slides. Your face, or just the app sitting still.*

> **Say this:** My parents live about a thousand kilometres from me. I'm not
> frightened every day. But some mornings I am, and calling to ask doesn't
> help - because whatever is actually happening, she says *sab theek hai*.
> Everything's fine.
>
> So I built the thing I actually wanted. Not a dashboard. One sentence a day.

---

## 0:25 - 1:05   The product

*Tab 1. The family screen. Let the sentence sit on screen for a beat before
you speak - it should read before you explain it.*

> **Say this:** This is my mother's Sunday. She was up around half seven, she
> went to the shop, her phone went on charge in the evening.
>
> That's the whole product. There is no chart anywhere in this app, and that's
> deliberate - a dashboard hands you the anxiety back and asks you to
> interpret it. A sentence resolves it.

*Scroll down slowly to the week strip. Tap one of the days.*

> **Say this:** A week, so you can see a pattern rather than one day out of
> context. Tap a day and you get that day's sentence. That's as much detail as
> this app will ever give you.

---

## 1:05 - 1:55   The part nobody builds

*Tab 3 (or the phone). Demo controls. Tap "Run a quiet morning".*

> **Say this:** Now - a morning where nothing happens. She hasn't picked up her
> phone, and she's normally up by half seven.
>
> Watch who gets told first.

*Phone lights up on the lock screen. Hold it to the camera.*

> **Say this:** Her. Not me. She gets asked twice, quietly, before anyone in
> her family learns there was ever a question. Most mornings it ends right
> here and nobody is ever alarmed.

*Tap the notification. The app opens; the alert clears.*

> **Say this:** One tap, and it stands down. I was never told. That matters,
> because a system that cries wolf gets uninstalled by the person it's meant
> to protect - and then it protects nobody.

*Let the ladder run on to the end in tab 3.*

> **Say this:** If she doesn't answer, then I'm told. And if I don't answer
> either, it texts her neighbour - because I'm a thousand kilometres away and
> can do nothing, and the neighbour is forty feet away and can knock on the
> door.

---

## 1:55 - 2:30   How it's built

*Tab 2. The Step Functions graph, mid-execution, rungs lit up.*

> **Say this:** Here's the interesting problem. The event I care about is the
> one that never arrives. You cannot catch an absence with an event handler -
> nothing fires. So it needs a clock.
>
> EventBridge sweeps every ten minutes and asks one question per person:
> given what we know of *this* person, is anything wrong right now? Not a
> population average - the median of her own last three weeks. Step Functions
> runs the ladder, with a choice at the top that sends serious cases straight
> past the polite rungs. DynamoDB, Lambda, SNS for the neighbour's text,
> Amplify for the web build. All of it CDK, in TypeScript.

*Optional, only if you're ahead of time - show the two clocks in the README.*

> **Say this:** The thing I got wrong first time was using one clock. A phone
> that's switched off has an ordinary explanation. A phone that's on, and
> connected, and untouched all day does not. Those are two different
> questions, and I was asking one.

---

## 2:30 - 3:00   The honest bit, and the link

*Back to tab 1. The sentence on screen.*

> **Say this:** Two honest things. Bedrock writes that daily sentence - the
> call is live in the code - but this account's token quota is zero and
> can't be raised, so what you're reading came from the deterministic
> fallback. The API says which one wrote it rather than letting me pretend.
>
> And a late audit of my own code found eight bugs that were all silent -
> the system would have looked like it was watching someone while doing
> nothing at all. Those are written up in the README.
>
> It's running on AWS right now, the Android build is linked, and the whole
> thing is one question: was today an ordinary day.

---

## Plan B - no phone, 2 minutes 30

If push is unreliable on the night, cut section 1:05-1:55 down to this and do
it entirely in tab 1 with the `TRYME9` demo family:

*Demo controls, "Run two days of silence".*

> **Say this:** Two days without touching the phone. No polite rungs here -
> at this point asking her nicely is the wrong behaviour, so it tells the
> family and the neighbour at once.

*Show the Step Functions execution skipping straight to the alarm rungs.*

> **Say this:** Same ladder, different route through it, decided at the top.

Then go straight to **1:55 - How it's built**.

---

## Lines to cut first if you're over time

1. The two-clocks paragraph at 2:20.
2. The week strip at 0:50.
3. The eight-bugs line at 2:45.

Never cut: *she is asked first*, and *absence is not an event*. Those are the
two ideas that make this different from a tracker.
