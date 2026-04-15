import AsyncStorage from "@react-native-async-storage/async-storage";

const SERVICE = "adam-connect.device-token";
const FALLBACK_KEY = `${SERVICE}.fallback`;

type KeychainModule = {
  getGenericPassword(options: { service: string }): Promise<false | { password: string }>;
  setGenericPassword(username: string, password: string, options: { service: string }): Promise<void>;
  resetGenericPassword(options: { service: string }): Promise<void>;
};

function getKeychainModule(): KeychainModule | null {
  try {
    return require("react-native-keychain") as KeychainModule;
  } catch {
    return null;
  }
}

export async function loadDeviceToken(): Promise<string | null> {
  const keychain = getKeychainModule();
  if (keychain) {
    try {
      const entry = await keychain.getGenericPassword({ service: SERVICE });
      if (entry) {
        return entry.password;
      }
    } catch {
      // Fall back to AsyncStorage if secure storage is unavailable on this device/build.
    }
  }

  return AsyncStorage.getItem(FALLBACK_KEY);
}

export async function saveDeviceToken(token: string): Promise<void> {
  const keychain = getKeychainModule();
  if (keychain) {
    try {
      await keychain.setGenericPassword("paired-device", token, { service: SERVICE });
      await AsyncStorage.removeItem(FALLBACK_KEY);
      return;
    } catch {
      // Fall back to AsyncStorage if secure storage is unavailable on this device/build.
    }
  }

  await AsyncStorage.setItem(FALLBACK_KEY, token);
}

export async function clearDeviceToken(): Promise<void> {
  const keychain = getKeychainModule();
  if (keychain) {
    try {
      await keychain.resetGenericPassword({ service: SERVICE });
    } catch {
      // Clear the fallback entry below even if secure storage cleanup fails.
    }
  }

  await AsyncStorage.removeItem(FALLBACK_KEY);
}
