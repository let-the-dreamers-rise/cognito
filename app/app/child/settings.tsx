import { useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { getPulse, updateSettings } from '../../src/api';
import type { Session } from '../../src/api';
import { loadSession } from '../../src/session';
import { colors, fonts, space, type } from '../../src/theme';

export default function ChildSettings() {
  const [session, setSession] = useState<Session | null>(null);
  const [herPhone, setHerPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSession().then(async (s) => {
      if (!s) return router.replace('/');
      setSession(s);
      try {
        const pulse = await getPulse(s.memberId, s.deviceToken);
        setHerPhone(pulse.phone ?? '');
        setContactName(pulse.localContact?.name ?? '');
        setContactPhone(pulse.localContact?.phone ?? '');
      } catch {
        // An empty form is a fine starting point.
      }
    });
  }, []);

  const save = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      await updateSettings(session.memberId, session.deviceToken, {
        phone: herPhone.trim() || null,
        localContact: contactPhone.trim()
          ? { name: contactName.trim() || 'Neighbour', phone: contactPhone.trim() }
          : null,
      });
      setSaved(true);
      setTimeout(() => router.back(), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
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

        <Text style={[type.hero, s.headline]}>Who can reach her</Text>

        <Text style={type.label}>Her number</Text>
        <Text style={[type.small, s.help]}>
          So you can call straight from an alert instead of hunting for the dialler.
        </Text>
        <TextInput
          value={herPhone}
          onChangeText={setHerPhone}
          placeholder='+91'
          keyboardType='phone-pad'
          placeholderTextColor={colors.muted}
          style={s.input}
        />

        <Text style={[type.label, s.sectionGap]}>Someone nearby</Text>
        <Text style={[type.small, s.help]}>
          A neighbour, the watchman, a cousin on the same street. If she does not answer,
          you are a thousand kilometres away and they are forty feet away. They get a text
          asking them to knock.
        </Text>
        <TextInput
          value={contactName}
          onChangeText={setContactName}
          placeholder='Name, e.g. Sharma uncle'
          placeholderTextColor={colors.muted}
          style={s.input}
        />
        <TextInput
          value={contactPhone}
          onChangeText={setContactPhone}
          placeholder='+91'
          keyboardType='phone-pad'
          placeholderTextColor={colors.muted}
          style={[s.input, s.spaced]}
        />

        <Pressable style={[s.primary, saving && s.disabled]} disabled={saving} onPress={save}>
          <Text style={s.primaryText}>
            {saved ? 'Saved' : saving ? 'Saving' : 'Save'}
          </Text>
        </Pressable>

        {error && <Text style={s.error}>{error}</Text>}

        <Text style={[type.small, s.footer]}>
          She can see both of these on her own phone, and change them.
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
  help: { marginTop: space.xs, marginBottom: space.sm },
  sectionGap: { marginTop: space.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: space.md,
    paddingVertical: 15,
    fontSize: 16,
    fontFamily: fonts.sans,
    color: colors.ink,
  },
  spaced: { marginTop: space.sm },
  primary: {
    marginTop: space.lg,
    backgroundColor: colors.ink,
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryText: { color: colors.paper, fontSize: 16, fontFamily: fonts.sansStrong },
  disabled: { opacity: 0.5 },
  error: { marginTop: space.md, color: '#9B2C2C', fontSize: 14, fontFamily: fonts.sans },
  footer: { marginTop: space.lg, marginBottom: space.xl },
});
