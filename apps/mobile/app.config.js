module.exports = {
  expo: {
    name: "Freedom",
    slug: "freedom-mobile-companion",
    plugins: [
      [
        "expo-speech-recognition",
        {
          androidSpeechServicePackages: [
            "com.google.android.googlequicksearchbox",
            "com.google.android.as",
            "com.google.android.tts"
          ]
        }
      ]
    ]
  }
};
