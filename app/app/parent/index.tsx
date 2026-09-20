import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { getPulse, sendSignals, updateSettings } from '../../src/api';
import type { FamilyMember, Pulse, Session } from '../../src/api';
import { loadSession } from '../../src/session';
import { watchForeground } from '../../src/signals';
import { onNotificationTap } from '../../src/push';
import { Reveal } from '../../src/Reveal';
import { colors, fonts, space, type } from '../../src/theme';

const partOfDay = (iso: string) => {
  const hour = new Date(iso).getHours();
  if (hour < 12) return 'this morning';
  if (hour < 17) return 'this afternoon';
  return 'this evening';
};

/**
 * The app opens on them, not on her. She is not a patient checking in; she is
 * someone whose children thought about her today, and that is the only reason
 * she will ever open this twice.
 */
function greetingFor(family: FamilyMember[] | null) {
  const looked = (family ?? [])
    .filter((f) => f.lastLookedAt)
    .sort((a, b) => (b.lastLookedAt ?? '').localeCompare(a.lastLookedAt ?? ''));

  if (looked.length === 0) {
    return 'Your family will see that today went ordinarily.';
  }
  if (looked.length === 1) {
    return `${looked[0].name} looked in on you ${partOfDay(looked[0].lastLookedAt!)}.`;
  }
  return `${looked[0].name} and ${looked.length - 1} other${
    looked.length > 2 ? 's' : ''
  } looked in on you today.`;
}

export default function ParentHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [asked, setAsked] = useState(false);
  const [away, setAway] = useState(false);

  useEffect(() => {
    loadSession().then((s) => {
      if (!s) return router.replace('/');
      setSession(s);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const next = await getPulse(session.memberId, session.deviceToken);
      setPulse(next);
      setAway(Boolean(next.travelUntil && next.travelUntil > new Date().toISOString()));
    } catch {
      // Her screen should never show an error. The signals keep flowing regardless.
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return;
    return watchForeground(session.memberId, session.deviceToken);
  }, [session]);

  // Tapping the nudge stands the ladder down before the family is ever told.
  useEffect(() => {
    if (!session) return;
    return onNotificationTap((action) => {
      if (action !== 'checkin') return;
      setConfirmed(true);
      sendSignals(session.memberId, session.deviceToken, [{ type: 'checkin' }]).catch(() => {});
    });
  }, [session]);

  const tap = async (kind: 'checkin' | 'callme') => {
    if (!session) return;
    if (kind === 'checkin') setConfirmed(true);
    else setAsked(true);
    try {
      await sendSignals(session.memberId, session.deviceToken, [{ type: kind }]);
    } catch {
      // A failed tap is not worth alarming her about; the heartbeat will follow.
    }
  };

  const toggleAway = async (next: boolean) => {
    if (!session) return;
    setAway(next);
    const until = next
      ? new Date(Date.now() + 7 * 86_400_000).toISOString()
      : null;
    try {
      await updateSettings(session.memberId, session.deviceToken, { travelUntil: until });
    } catch {
      setAway(!next);
    }
  };

  const family = pulse?.family ?? [];

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.inner}>
        <View style={s.headerRow}>
          <Text style={type.label}>Sab Theek</Text>
          <Link href='/parent/privacy' asChild>
            <Pressable hitSlop={10}>
              <Text style={type.small}>What they see</Text>
            </Pressable>
          </Link>
        </View>

        <Reveal>
          <Text style={[type.hero, s.headline]}>{greetingFor(pulse?.family ?? null)}</Text>
        </Reveal>

        {/* She reads exactly the sentence her children read. Nothing is
            described about her that she cannot see herself. */}
        {pulse?.today && (
          <Reveal delay={110} style={s.mirror}>
            <Text style={type.label}>What they were told</Text>
            <Text style={[type.body, s.mirrorText]}>{pulse.today}</Text>
          </Reveal>
        )}

        <Pressable style={s.callMe} onPress={() => tap('callme')}>
          <Text style={s.callMeText}>
            {asked ? 'They have been asked' : 'Ask them to call me'}
          </Text>
        </Pressable>
        <Text style={[type.small, s.callNote]}>
          No need to wonder whether they are busy.
        </Text>

        {family.length > 0 && (
          <View style={s.familyBlock}>
            <Text style={type.label}>Your family</Text>
            {family.map((member) => (
              <View key={member.name} style={s.familyRow}>
                <Text style={[type.body, s.familyName]}>{member.name}</Text>
                <Text style={type.small}>
                  {member.lastLookedLabel
                    ? `looked in at ${member.lastLookedLabel}`
                    : 'has not looked yet'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Pressable style={[s.fine, confirmed && s.fineDone]} onPress={() => tap('checkin')}>
          <Text style={[s.fineText, confirmed && s.fineTextDone]}>
            {confirmed ? 'Told them you are fine' : 'I am fine today'}
          </Text>
        </Pressable>

        <View style={s.awayCard}>
          <View style={s.awayRow}>
            <Text style={type.title}>I am away</Text>
            <Switch
              value={away}
              onValueChange={toggleAway}
              trackColor={{ true: colors.calm, false: colors.hairline }}
            />
          </View>
          <Text style={type.small}>
            Turn this on when you travel and nobody will worry about a quiet morning.
            If days go by with no sign of you at all, your family is still told.
          </Text>
        </View>

        {session?.pairCode && family.length === 0 && (
          <View style={s.codeCard}>
            <Text style={type.label}>Your code</Text>
            <Text style={s.code}>{session.pairCode}</Text>
            <Text style={type.small}>
              Give this only to family you want to see your days. You can stop sharing at
              any time, and they cannot undo it.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  inner: {
    padding: space.md,
    paddingTop: space.lg,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: space.xl,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headline: { marginTop: space.md, marginBottom: space.md },

  mirror: {
    padding: space.md,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: space.xs,
    marginBottom: space.lg,
  },
  mirrorText: { color: colors.ink },

  callMe: {
    backgroundColor: colors.ink,
    paddingVertical: 30,
    borderRadius: 20,
    alignItems: 'center',
  },
  callMeText: { color: colors.paper, fontSize: 22, fontFamily: fonts.sansStrong },
  callNote: { textAlign: 'center', marginTop: space.xs },

  familyBlock: { marginTop: space.lg, gap: space.sm },
  familyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    paddingBottom: space.sm,
  },
  familyName: { fontFamily: fonts.sansMedium },

  fine: {
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    paddingVertical: 20,
    borderRadius: 20,
    alignItems: 'center',
  },
  fineDone: { backgroundColor: '#EAF3EE', borderColor: '#C8E0D3' },
  fineText: { color: colors.ink, fontSize: 18, fontFamily: fonts.sansStrong },
  fineTextDone: { color: colors.calm },

  awayCard: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: space.sm,
  },
  awayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  codeCard: {
    marginTop: space.lg,
    padding: space.md,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: space.xs,
  },
  code: { fontSize: 32, letterSpacing: 8, color: colors.ink, fontFamily: fonts.sansStrong },
});
