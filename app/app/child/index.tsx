import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import {
  getPulse,
  resolveIncident,
  seedBaseline,
  triggerQuietMorning,
} from '../../src/api';
import type { Pulse, Session, WeekDay } from '../../src/api';
import { loadSession } from '../../src/session';
import { Reveal } from '../../src/Reveal';
import { colors, fonts, space, statusColor, type } from '../../src/theme';

const POLL_MS = 10_000;

const dayColor = (status: WeekDay['status']) =>
  status === 'normal' ? colors.calm : status === 'quiet' ? colors.checking : colors.hairline;

export default function ChildHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [picked, setPicked] = useState<WeekDay | null>(null);
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

  const standDown = async () => {
    if (!session) return;
    await resolveIncident(session.memberId, session.deviceToken).catch(() => {});
    await refresh();
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
        <Text style={[type.small, s.loadingNote]}>Looking in on her</Text>
      </SafeAreaView>
    );
  }

  const concerned = Boolean(pulse?.concern);

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        contentContainerStyle={s.inner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} />}
      >
        <View style={s.headerRow}>
          <Text style={type.label}>{pulse?.name ?? session.memberName ?? 'Home'}</Text>
          <View style={s.headerRight}>
            <Link href='/child/settings' asChild>
              <Pressable hitSlop={10}>
                <Text style={type.small}>Settings</Text>
              </Pressable>
            </Link>
            <View style={[s.dot, { backgroundColor: statusColor(pulse?.status) }]} />
          </View>
        </View>

        {/* On an ordinary day this reassures. When something is wrong it says so
            plainly and takes the screen. */}
        <Reveal>
          <Text style={[type.hero, s.headline, pulse?.critical && s.criticalHeadline]}>
            {error ?? pulse?.concern ?? pulse?.today ?? pulse?.pulse ?? 'No word yet today.'}
          </Text>
        </Reveal>

        {(pulse?.today || concerned) && <Text style={[type.body, s.sub]}>{pulse?.pulse}</Text>}

        {concerned && (
          <View style={[s.actions, pulse?.critical && s.actionsCritical]}>
            {pulse?.critical && (
              <Text style={[type.body, s.criticalText]}>
                We have already tried her phone and had no answer.
                {pulse.localContact
                  ? ` ${pulse.localContact.name} has been sent a message.`
                  : ''}
              </Text>
            )}
            <View style={s.actionRow}>
              <Pressable
                style={[s.action, s.actionPrimary, !pulse?.phone && s.disabled]}
                disabled={!pulse?.phone}
                onPress={() => Linking.openURL(`tel:${pulse?.phone}`)}
              >
                <Text style={s.actionPrimaryText}>
                  {pulse?.phone ? `Call ${pulse.name}` : 'No number saved'}
                </Text>
              </Pressable>
              <Pressable style={s.action} onPress={standDown}>
                <Text style={s.actionText}>I have spoken to her</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Seven days as a row. One day is an anecdote; a week is a pattern. */}
        {pulse?.week && (
          <View style={s.weekBlock}>
            <Text style={type.label}>This week</Text>
            <View style={s.week}>
              {pulse.week.map((day, index) => (
                <Pressable
                  key={day.date}
                  style={s.dayCol}
                  onPress={() => setPicked(picked?.date === day.date ? null : day)}
                >
                  <View
                    style={[
                      s.dayBar,
                      { backgroundColor: dayColor(day.status) },
                      picked?.date === day.date && s.dayBarPicked,
                    ]}
                  />
                  <Text
                    style={[
                      s.dayLabel,
                      index === pulse.week!.length - 1 && s.dayLabelToday,
                    ]}
                  >
                    {day.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {picked && (
              <Text style={[type.small, s.pickedText]}>
                {picked.narrative ?? 'Nothing recorded for this day.'}
              </Text>
            )}
          </View>
        )}

        {pulse?.learning && (
          <View style={s.learning}>
            <Text style={type.small}>
              Still learning her routine {'·'} {pulse.learningProgress} ordinary days.
              Until then Sab Theek will not raise anything.
            </Text>
          </View>
        )}

        <View style={s.facts}>
          {pulse?.firstActivityAt && (
            <Fact label='First picked up her phone' value={pulse.firstActivityAt} />
          )}
          {pulse?.usuallyUpBy && <Fact label='Usually up by' value={pulse.usuallyUpBy} />}
          {pulse?.worryAfter && !pulse.learning && (
            <Fact label='We check in after' value={pulse.worryAfter} />
          )}
          {!!pulse?.steps && (
            <Fact label='Walked' value={`${pulse.steps.toLocaleString('en-IN')} steps`} />
          )}
        </View>

        {/* Without this the final rung of the ladder has nobody to call. */}
        {pulse && !pulse.localContact && (
          <Link href='/child/settings' asChild>
            <Pressable style={s.warning}>
              <Text style={[type.body, s.warningText]}>
                No one nearby is registered. If she does not answer, there is nobody we can
                reach. Tap to add a neighbour.
              </Text>
            </Pressable>
          </Link>
        )}

        {/* An invisible safety net is an untrusted one. */}
        {pulse?.incidents && pulse.incidents.length > 0 && (
          <View style={s.history}>
            <Text style={type.label}>What we have done</Text>
            {pulse.incidents.slice(0, 4).map((incident) => (
              <View key={incident.incidentId} style={s.historyRow}>
                <Text style={[type.body, s.historyWhat]}>{incident.what}</Text>
                <Text style={type.small}>{incident.outcome}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable onPress={() => setShowDemo((v) => !v)} style={s.demoToggle}>
          <Text style={type.small}>{showDemo ? 'Hide demo controls' : 'Demo controls'}</Text>
        </Pressable>

        {showDemo && (
          <View style={s.demoCard}>
            <Text style={type.small}>
              For judges: seed a week of ordinary days, then run a morning where nothing
              happens. The ladder waits seconds a rung instead of twenty minutes.
            </Text>
            <Pressable
              style={s.demoBtn}
              onPress={() =>
                runDemo(async () => {
                  await seedBaseline(session.memberId, session.deviceToken);
                  return 'Seeded. She is usually up around 7:30am.';
                })
              }
            >
              <Text style={s.demoBtnText}>Seed her routine and week</Text>
            </Pressable>
            <Pressable
              style={s.demoBtn}
              onPress={() =>
                runDemo(async () => {
                  await triggerQuietMorning(session.memberId, session.deviceToken, 'late', 12);
                  return 'A quiet morning. She is asked first, twice.';
                })
              }
            >
              <Text style={s.demoBtnText}>Run a quiet morning</Text>
            </Pressable>
            <Pressable
              style={[s.demoBtn, s.demoBtnCritical]}
              onPress={() =>
                runDemo(async () => {
                  await triggerQuietMorning(
                    session.memberId,
                    session.deviceToken,
                    'critical48',
                    5
                  );
                  return 'Two days of silence. No polite rungs - family and neighbour at once.';
                })
              }
            >
              <Text style={[s.demoBtnText, s.demoBtnCriticalText]}>
                Run two days of silence
              </Text>
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
  loadingNote: { marginTop: space.sm },
  inner: {
    padding: space.md,
    paddingTop: space.lg,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  headline: { marginTop: space.md },
  criticalHeadline: { color: colors.critical, fontFamily: fonts.serifStrong },
  sub: { color: colors.muted, marginTop: space.sm },

  actions: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: 16,
    backgroundColor: '#FDF4E6',
    borderWidth: 1,
    borderColor: '#F0DFC2',
    gap: space.sm,
  },
  actionsCritical: { backgroundColor: '#FCEDED', borderColor: '#F0C9C9' },
  criticalText: { color: '#7A1A1A' },
  actionRow: { gap: space.sm },
  action: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  actionPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  actionPrimaryText: { color: colors.paper, fontSize: 16, fontFamily: fonts.sansStrong },
  actionText: { color: colors.ink, fontSize: 15, fontFamily: fonts.sansStrong },
  disabled: { opacity: 0.4 },

  weekBlock: { marginTop: space.lg, gap: space.sm },
  week: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  dayCol: { flex: 1, alignItems: 'center', gap: space.xs },
  dayBar: { height: 38, width: '100%', borderRadius: 7 },
  dayBarPicked: { borderWidth: 2, borderColor: colors.ink },
  dayLabel: { fontSize: 11, color: colors.muted, fontFamily: fonts.sansMedium },
  dayLabelToday: { color: colors.ink, fontFamily: fonts.sansStrong },
  pickedText: { marginTop: space.xs },

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
  factValue: { fontFamily: fonts.sansMedium },

  warning: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: 16,
    backgroundColor: '#FDF4E6',
    borderWidth: 1,
    borderColor: '#F0DFC2',
  },
  warningText: { color: '#6B4B12' },

  history: { marginTop: space.lg, gap: space.sm },
  historyRow: {
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  historyWhat: { fontFamily: fonts.sansMedium },

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
  demoBtnText: { color: colors.ink, fontSize: 15, fontFamily: fonts.sansStrong },
  demoBtnCritical: { borderColor: '#F0C9C9', backgroundColor: '#FCEDED' },
  demoBtnCriticalText: { color: '#7A1A1A' },
});
