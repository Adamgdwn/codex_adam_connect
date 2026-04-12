module.exports = {
  expo: {
    name: "AdamConnectMobile",
    slug: "adam-connect-mobile",
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
