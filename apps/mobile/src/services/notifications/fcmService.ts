import { PermissionsAndroid, Platform } from "react-native";
import { FCM_ENABLED } from "../../generated/runtimeConfig";

type MessagingModule = {
  AuthorizationStatus?: {
    AUTHORIZED: number;
    PROVISIONAL: number;
  };
  registerDeviceForRemoteMessages(): Promise<void>;
  requestPermission(): Promise<number>;
  getToken(): Promise<string>;
  onTokenRefresh(listener: (token: string) => void): () => void;
  setBackgroundMessageHandler?(handler: (message: unknown) => Promise<void>): void;
};

function getMessagingModule(): (() => MessagingModule) | null {
  try {
    return require("@react-native-firebase/messaging").default as () => MessagingModule;
  } catch {
    return null;
  }
}

const POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS";

export class FcmService {
  private readonly messagingFactory = FCM_ENABLED ? getMessagingModule() : null;

  isAvailable(): boolean {
    return Platform.OS === "android" && FCM_ENABLED && this.messagingFactory !== null;
  }

  async requestPushToken(): Promise<string> {
    const messaging = this.getMessagingInstance();
    if (!messaging) {
      throw new Error("Android push notifications are not available in this build yet.");
    }

    await ensureAndroidNotificationPermission();
    await messaging.registerDeviceForRemoteMessages();
    const status = await messaging.requestPermission();
    const authorized = messaging.AuthorizationStatus?.AUTHORIZED ?? 1;
    const provisional = messaging.AuthorizationStatus?.PROVISIONAL ?? 2;
    if (status !== authorized && status !== provisional) {
      throw new Error("Android notification permission was not granted.");
    }

    return messaging.getToken();
  }

  subscribeToTokenRefresh(listener: (token: string) => void): (() => void) | null {
    return this.getMessagingInstance()?.onTokenRefresh(listener) ?? null;
  }

  installBackgroundHandler(): void {
    this.getMessagingInstance()?.setBackgroundMessageHandler?.(async () => undefined);
  }

  private getMessagingInstance(): MessagingModule | null {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      return this.messagingFactory!();
    } catch {
      return null;
    }
  }
}

async function ensureAndroidNotificationPermission(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  if (typeof Platform.Version === "number" && Platform.Version < 33) {
    return;
  }

  const granted = await PermissionsAndroid.request(POST_NOTIFICATIONS);
  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error("Android notification permission is required for background updates.");
  }
}
