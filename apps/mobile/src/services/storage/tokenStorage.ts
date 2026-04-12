import * as Keychain from "react-native-keychain";

const SERVICE = "adam-connect.device-token";

export async function loadDeviceToken(): Promise<string | null> {
  const entry = await Keychain.getGenericPassword({ service: SERVICE });
  return entry ? entry.password : null;
}

export async function saveDeviceToken(token: string): Promise<void> {
  await Keychain.setGenericPassword("paired-device", token, { service: SERVICE });
}

export async function clearDeviceToken(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
