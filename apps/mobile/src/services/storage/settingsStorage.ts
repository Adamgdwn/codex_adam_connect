import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "adam-connect.settings";

export interface StoredSettings {
  baseUrl: string;
  deviceName: string;
  autoSpeak: boolean;
  autoSendVoice: boolean;
}

export async function loadSettings(): Promise<StoredSettings | null> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as StoredSettings;
}

export function saveSettings(settings: StoredSettings): Promise<void> {
  return AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSettings(): Promise<void> {
  return AsyncStorage.removeItem(SETTINGS_KEY);
}
