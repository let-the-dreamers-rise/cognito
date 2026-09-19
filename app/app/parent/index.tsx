import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { sendSignals } from '../../src/api';
import { loadSession } from '../../src/session';
import { watchForeground } from '../../src/signals';
import { onNotificationTap } from '../../src/push';
import type { Session } from '../../src/api';
import { colors, space, type } from '../../src/theme';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function ParentHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    loadSession().then((s) => {
      if (!s) return router.replace('/');
      setSession(s);
    });
  }, []);

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
      sendSignals(session.memberId, session.deviceToken, [{ type: 'checkin' }]).catch(
        () => {}
      );
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

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.inner}>
        <Text style={type.label}>Sab Theek</Text>
        <Text style={[type.hero, s.headline]}>
          {greeting()}, {session?.memberName ?? 'Amma'}
        </Text>

        <Text style={[type.body, s.reassure]}>
          {confirmed
            ? 'Thank you. Your family knows you are alright.'
            : 'Your family only ever sees whether your day looked ordinary.'}
        </Text>

        <Pressable style={[s.big, confirmed && s.bigDone]} onPress={() => tap('checkin')}>
          <Text style={[s.bigText, confirmed && s.bigTextDone]}>
            {confirmed ? 'Told them' : 'I am fine today'}
          </Text>
        </Pressable>

        <Pressable style={s.callMe} onPress={() => tap('callme')}>
          <Text style={s.callMeText}>{asked ? 'They have been asked' : 'Ask them to call me'}</Text>
        </Pressable>
        <Text style={[type.small, s.callNote]}>
          No need to wonder whether they are busy.
        </Text>

        {session?.pairCode && (
          <View style={s.codeCard}>
            <Text style={type.label}>Your code</Text>
            <Text style={s.code}>{session.pairCode}</Text>
            <Text style={type.small}>
              Give this only to family you want to see your days. You can stop sharing at any
              time, and they cannot undo it.
            </Text>
          </View>
        )}

        <Link href='/parent/privacy' asChild>
          <Pressable style={s.privacyLink}>
            <Text style={s.privacyText}>What Sab Theek can and cannot see</Text>
          </Pressable>
        </Link>
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
  },
  headline: { marginTop: space.sm },
  reassure: { color: colors.muted, marginTop: space.sm, marginBottom: space.lg },
  big: {
    backgroundColor: colors.ink,
    paddingVertical: 34,
    borderRadius: 20,
    alignItems: 'center',
  },
  bigDone: { backgroundColor: colors.calm },
  bigText: { color: colors.paper, fontSize: 24, fontWeight: '600' },
  bigTextDone: { color: colors.paper },
  callMe: {
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    paddingVertical: 22,
    borderRadius: 20,
    alignItems: 'center',
  },
  callMeText: { color: colors.ink, fontSize: 19, fontWeight: '600' },
  callNote: { textAlign: 'center', marginTop: space.xs },
  codeCard: {
    marginTop: space.lg,
    padding: space.md,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: space.xs,
  },
  code: { fontSize: 32, letterSpacing: 8, color: colors.ink, fontWeight: '600' },
  privacyLink: { marginTop: space.lg, paddingVertical: space.sm },
  privacyText: {
    color: colors.ink,
    fontSize: 15,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
