import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { enrolParent, enrolWatcher } from '../src/api';
import { loadSession, saveSession } from '../src/session';
import { colors, space, type } from '../src/theme';

type Mode = 'choose' | 'parent' | 'watcher';

export default function Welcome() {
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    loadSession().then((session) => {
      if (session) router.replace(session.role === 'parent' ? '/parent' : '/child');
      else setRestoring(false);
    });
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const startAsParent = () =>
    run(async () => {
      const session = await enrolParent(name.trim() || 'Amma', null);
      await saveSession({ ...session, role: 'parent' });
      router.replace('/parent');
    });

  const startAsWatcher = () =>
    run(async () => {
      const session = await enrolWatcher(code.trim().toUpperCase(), name.trim() || 'Family', null);
      await saveSession({ ...session, role: 'watcher' });
      router.replace('/child');
    });

  if (restoring) {
    return (
      <SafeAreaView style={s.screen}>
        <ActivityIndicator color={colors.muted} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.inner}>
        <Text style={type.label}>Sab Theek</Text>
        <Text style={[type.hero, s.headline]}>
          {mode === 'choose'
            ? 'Knowing today was an ordinary day.'
            : mode === 'parent'
              ? 'Your family will only ever see whether your day looked ordinary.'
              : 'Enter the code they gave you.'}
        </Text>

        {mode === 'choose' && (
          <View style={s.stack}>
            <Pressable style={s.primary} onPress={() => setMode('parent')}>
              <Text style={s.primaryText}>I live on my own</Text>
            </Pressable>
            <Pressable style={s.secondary} onPress={() => setMode('watcher')}>
              <Text style={s.secondaryText}>Someone I love does</Text>
            </Pressable>
            <Text style={[type.small, s.note]}>
              The person living alone sets this up and hands out the code. Nobody can add
              themselves to someone else{'’'}s account.
            </Text>
          </View>
        )}

        {mode !== 'choose' && (
          <View style={s.stack}>
            {mode === 'watcher' && (
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder='6-letter code'
                autoCapitalize='characters'
                placeholderTextColor={colors.muted}
                style={[s.input, s.codeInput]}
              />
            )}
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={mode === 'parent' ? 'Your name' : 'Your name'}
              placeholderTextColor={colors.muted}
              style={s.input}
            />
            <Pressable
              style={[s.primary, busy && s.disabled]}
              disabled={busy}
              onPress={mode === 'parent' ? startAsParent : startAsWatcher}
            >
              <Text style={s.primaryText}>{busy ? 'One moment' : 'Continue'}</Text>
            </Pressable>
            <Pressable onPress={() => setMode('choose')}>
              <Text style={[type.small, s.note]}>Back</Text>
            </Pressable>
          </View>
        )}

        {error && <Text style={s.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center' },
  inner: { paddingHorizontal: space.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  headline: { marginTop: space.sm, marginBottom: space.lg },
  stack: { gap: space.sm },
  primary: {
    backgroundColor: colors.ink,
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryText: { color: colors.paper, fontSize: 16, fontWeight: '600' },
  secondary: {
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  secondaryText: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: space.md,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.ink,
  },
  codeInput: { letterSpacing: 6, fontSize: 20, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  note: { marginTop: space.sm, textAlign: 'center' },
  error: { marginTop: space.md, color: '#9B2C2C', fontSize: 14, textAlign: 'center' },
});
