import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from './api';

const KEY = 'sabtheek.session.v1';

export async function saveSession(session: Session): Promise<Session> {
  await AsyncStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
