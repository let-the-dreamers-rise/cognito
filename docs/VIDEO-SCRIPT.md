# Sab Theek - 3 minute script

Read the **bold** lines aloud. *Italics* are what you do, not what you say.
Push notifications work, so the lock-screen moment is the centre of the video.

---

## Setup on the one phone

The app and Chrome have separate storage, so the same phone can be both sides.

1. **Sab Theek app** - "I live on my own" - name her - allow notifications.
   Note the 6-letter code.
2. In the app: **"What they see"** - turn on **Allow practice alerts**.
3. **Chrome on the same phone** - the deployed URL - "Someone I love does" -
   enter that code.
4. Swipe down - **Screen Record**, microphone ON.

Rehearse steps in the 1:20 block once before the real take.

Record the architecture section separately on the laptop. That is the only cut.

---

## 0:00 - 0:25   The problem

*Phone screen still, or your face.*

**"My mother lives alone, about a thousand kilometres from me. I'm not
frightened every day. But some mornings I am, and calling to ask doesn't help,
because whatever is actually happening she says the same four words. Sab theek
hai. Everything's fine.**

**So I built the thing I actually wanted. Not a dashboard. One sentence a
day."**

---

## 0:25 - 0:50   The sentence

*Open Chrome - the family side. Let the sentence sit for a beat before you
speak.*

**"This is my mother's Sunday. She was up around half seven, she went to the
shop, her phone went on charge in the evening.**

**That's the whole product. There is no chart anywhere in this app, and that's
deliberate. A dashboard hands you the anxiety back and asks you to interpret
it. A sentence resolves it."**

---

## 0:50 - 1:15   Her side

*Switch to the Sab Theek app.*

**"And this is what she sees. It doesn't open on her own status. It opens on
us. 'Ashwin looked in on you this morning.'**

**If this app opened by telling a seventy-year-old woman how closely she's
being watched, she'd delete it. Instead it tells her that her children thought
about her today, which is the only reason she'll ever open it twice.**

**She reads the exact same sentence her family reads. And that button just says
'Ask them to call me', because the hesitation was never wanting to call. It's
'he must be busy'."**

---

## 1:15 - 2:00   The part nobody builds

*Chrome - Demo controls - "Run a quiet morning". Then press the power button
and put the phone on the lock screen.*

**"Now a morning where nothing happens. She hasn't picked up her phone, and
she's normally up by half seven.**

**Watch who gets told first."**

*The notification arrives on the lock screen. Say nothing for two seconds and
let the viewer read it.*

**"Her. Not me. She's asked twice, quietly, before anyone in her family learns
there was ever a question."**

*Tap the notification. The app opens. Tap "I am fine today".*

**"One tap, and it stands down. I was never told. That matters, because a
system that cries wolf gets uninstalled by the person it's meant to protect,
and then it protects nobody."**

*Back to Chrome. Run a quiet morning again. This time do not answer. Let the
family screen update.*

**"If she doesn't answer, then I'm told, and I'm handed her number. And if I
don't answer either, it texts her neighbour. I'm a thousand kilometres away and
can do nothing. The neighbour is forty feet away and can knock on the door."**

---

## 2:00 - 2:40   How it's built

*Laptop recording. Step Functions graph, mid-execution.*

**"Here's the interesting problem. The event I care about is the one that never
arrives. You cannot catch an absence with an event handler, because nothing
fires. So it needs a clock.**

**EventBridge sweeps every ten minutes and asks one question per person: given
what we know of this person, is anything wrong right now? Not a population
average, the median of her own last three weeks.**

**Step Functions runs the ladder, with a choice at the top that sends serious
cases straight past the polite rungs. DynamoDB, Lambda, SNS for the neighbour's
text, Amplify for the web build. All of it CDK, in TypeScript."**

---

## 2:40 - 3:00   Honest, then the link

*Back to the sentence.*

**"Two honest things. Bedrock writes that daily sentence and the call is live in
the code, but this account's token quota is zero and can't be raised, so what
you're reading came from the deterministic fallback. The API reports which one
wrote it rather than letting me pretend.**

**And auditing my own code late on found six bugs that were all silent. The
system would have looked like it was watching someone while doing nothing at
all.**

**It's running on AWS right now. The whole thing is one question: was today an
ordinary day."**

---

## If you run long, cut in this order

1. The "ask them to call me" line at 1:10
2. The six-bugs line at 2:50
3. The second escalation at 1:50 - keep the first one

**Never cut:** *she is asked first*, and *absence is not an event*.

## Rules

- No intro animation, no music under speech, no reading the README aloud.
- Two seconds of silence while the notification lands. Let it breathe.
- Say the Bedrock limitation. It costs fifteen seconds and reads as rigour.
