export function generatePairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  for (let index = 0; index < 6; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}
