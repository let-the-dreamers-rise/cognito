import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getPulse, updateSettings } from '../../src/api';
import { loadSession } from '../../src/session';
import type { Session } from '../../src/api';
import { colors, fonts, space, type } from '../../src/theme';

/**
 * The refusal list is a feature, not a policy page. An abuser needs precision;
 * this product is built so it has none to give.
 */
const NEVER = [
  'Where you are',
  'What your messages say',
  'Who you called, or what you said',
  'Your camera or microphone',
  'Which apps you use',
  'What you spend, or where',
];

const SHARED = [
  'That your phone was picked up, and when',
  'Roughly how much you walked',
  'That your phone went on charge',
  'That you paid for something — the time only, never the amount or the shop',
];

export default function Privacy() {
  const [session, setSession] = useState<Session | null>(null);
  const [sharing, setSharing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [practice, setPractice] = useState(false);

  useEffect(() => {
    loadSession().then((s) => {
      if (!s) return router.replace('/');
      setSession(s);
      getPulse(s.memberId, s.deviceToken)
        .then((p) => setPractice(Boolean(p.demo)))
        .catch(() => {});
    });
  }, []);

  const togglePractice = async (next: boolean) => {
    if (!session) return;
    setPractice(next);
    try {
      await updateSettings(session.memberId, session.deviceToken, { demo: next });
    } catch {
      setPractice(!next);
    }
  };

  const toggle = async (next: boolean) => {
    if (!session) return;
    setSharing(next);
    setSaving(true);
    try {
      await updateSettings(session.memberId, session.deviceToken, { enabled: next });
    } catch {
      setSharing(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.inner}>
        <Pressable onPress={() => router.back()}>
          <Text style={s.back}>Back</Text>
        </Pressable>

        <Text style={[type.hero, s.headline]}>This is everything.</Text>

        <Text style={type.label}>What your family sees</Text>
        {SHARED.map((item) => (
          <Text key={item} style={[type.body, s.item]}>
            {item}
          </Text>
        ))}

        <Text style={[type.label, s.sectionGap]}>What nobody sees, ever</Text>
        {NEVER.map((item) => (
          <View key={item} style={s.neverRow}>
            <Text style={s.cross}>{'×'}</Text>
            <Text style={[type.body, s.neverText]}>{item}</Text>
          </View>
        ))}

        <View style={s.toggleCard}>
          <View style={s.toggleRow}>
            <Text style={type.title}>Share my days</Text>
            <Switch
              value={sharing}
              onValueChange={toggle}
              disabled={saving}
              trackColor={{ true: colors.calm, false: colors.hairline }}
            />
          </View>
          <Text style={type.small}>
            You can turn this off whenever you like and nobody has to approve it. Your family is
            simply told that you paused sharing.
          </Text>
        </View>

        {/* A safety net nobody has ever tested is a belief, not a safety net. */}
        <View style={s.toggleCard}>
          <View style={s.toggleRow}>
            <Text style={type.title}>Allow practice alerts</Text>
            <Switch
              value={practice}
              onValueChange={togglePractice}
              trackColor={{ true: colors.calm, false: colors.hairline }}
            />
          </View>
          <Text style={type.small}>
            Lets your family run a practice, so you both find out this works before the day it
            matters rather than on it. A practice behaves exactly like the real thing, including
            the message to your local contact.
          </Text>
        </View>

        <Text style={[type.small, s.footer]}>
          Sab Theek cannot be hidden on this phone. If it is installed, you will always see it.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  inner: { padding: space.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  back: {
    color: colors.muted,
    fontSize: 15,
    fontFamily: fonts.sans,
    paddingVertical: space.xs,
  },
  headline: { marginTop: space.sm, marginBottom: space.lg },
  item: { marginTop: space.xs },
  sectionGap: { marginTop: space.lg },
  neverRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginTop: space.xs },
  cross: { color: colors.muted, fontSize: 18, lineHeight: 25, fontFamily: fonts.sans },
  neverText: { color: colors.muted, flex: 1 },
  toggleCard: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: space.sm,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { marginTop: space.lg, marginBottom: space.xl },
});
