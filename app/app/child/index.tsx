import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { getPulse, seedBaseline, triggerQuietMorning } from '../../src/api';
import type { Pulse, Session } from '../../src/api';
import { loadSession } from '../../src/session';
import { colors, space, statusColor, type } from '../../src/theme';

const POLL_MS = 10_000;

export default function ChildHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoNote, setDemoNote] = useState<string | null>(null);

  useEffect(() => {
    loadSession().then((s) => {
      if (!s) return router.replace('/');
      setSession(s);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setPulse(await getPulse(session.memberId, session.deviceToken));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Sab Theek');
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [session, refresh]);

  const onPull = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const runDemo = async (fn: () => Promise<string>) => {
    try {
      setDemoNote(await fn());
      await refresh();
    } catch (err) {
      setDemoNote(err instanceof Error ? err.message : 'Demo action failed');
    }
  };

  if (!session || (!pulse && !error)) {
    return (
      <SafeAreaView style={[s.screen, s.centre]}>
        <ActivityIndicator color={colors.muted} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        contentContainerStyle={s.inner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} />}
      >
        <View style={s.headerRow}>
          <Text style={type.label}>{pulse?.name ?? session.memberName ?? 'Home'}</Text>
          <View style={[s.dot, { backgroundColor: statusColor(pulse?.status) }]} />
        </View>

        {/* The whole product is this sentence. Everything under it is secondary. */}
        <Text style={[type.hero, s.headline]}>
          {error ?? pulse?.today ?? pulse?.pulse ?? 'No word yet today.'}
        </Text>

        {pulse?.today && <Text style={[type.body, s.sub]}>{pulse.pulse}</Text>}

        {pulse?.learning && (
          <View style={s.learning}>
            <Text style={type.small}>
              Still learning her routine {'·'} {pulse.learningProgress} ordinary days. Until
              then Sab Theek will not raise anything.
            </Text>
          </View>
        )}

        <View style={s.facts}>
          {pulse?.firstActivityAt && (
            <Fact label='First picked up her phone' value={pulse.firstActivityAt} />
          )}
          {pulse?.usuallyUpBy && <Fact label='Usually up by' value={pulse.usuallyUpBy} />}
          {!!pulse?.steps && (
            <Fact label='Walked' value={`${pulse.steps.toLocaleString('en-IN')} steps`} />
          )}
        </View>

        {pulse?.status === 'checking' && (
          <View style={s.checking}>
            <Text style={[type.body, s.checkingText]}>
              We are asking her first. You will only hear from us if she does not answer.
            </Text>
          </View>
        )}

        <Pressable onPress={() => setShowDemo((v) => !v)} style={s.demoToggle}>
          <Text style={type.small}>{showDemo ? 'Hide demo controls' : 'Demo controls'}</Text>
        </Pressable>

        {showDemo && (
          <View style={s.demoCard}>
            <Text style={type.small}>
              For judges: seed six ordinary mornings, then run a morning where nothing happens.
              The ladder waits twelve seconds a rung instead of twenty minutes.
            </Text>
            <Pressable
              style={s.demoBtn}
              onPress={() =>
                runDemo(async () => {
                  await seedBaseline(session.memberId, session.deviceToken);
                  return 'Baseline seeded. She is usually up around 7:30am.';
                })
              }
            >
              <Text style={s.demoBtnText}>Seed her routine</Text>
            </Pressable>
            <Pressable
              style={s.demoBtn}
              onPress={() =>
                runDemo(async () => {
                  await triggerQuietMorning(session.memberId, session.deviceToken, 12);
                  return 'A quiet morning is running. Watch the parent phone get asked first.';
                })
              }
            >
              <Text style={s.demoBtnText}>Run a quiet morning</Text>
            </Pressable>
            {demoNote && <Text style={type.small}>{demoNote}</Text>}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.factRow}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.body, s.factValue]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centre: { alignItems: 'center', justifyContent: 'center' },
  inner: {
    padding: space.md,
    paddingTop: space.lg,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  headline: { marginTop: space.md },
  sub: { color: colors.muted, marginTop: space.sm },
  learning: {
    marginTop: space.md,
    padding: space.sm,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  facts: { marginTop: space.lg, gap: space.sm },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    paddingBottom: space.sm,
  },
  factValue: { fontWeight: '600' },
  checking: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: 16,
    backgroundColor: '#FDF4E6',
    borderWidth: 1,
    borderColor: '#F0DFC2',
  },
  checkingText: { color: '#6B4B12' },
  demoToggle: { marginTop: space.xl, paddingVertical: space.sm },
  demoCard: {
    padding: space.md,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: space.sm,
    marginBottom: space.xl,
  },
  demoBtn: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  demoBtnText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
});
