import { isExternalSendCancellation, isExternalSendConfirmation, parseExternalSendRequest } from "../src/utils/externalSend";

const recipients = [
  {
    id: "recipient-adam",
    hostId: "host-1",
    label: "Adam",
    channel: "email" as const,
    destination: "adamgoodwin@shaw.ca",
    createdAt: "2026-04-14T01:00:00.000Z",
    updatedAt: "2026-04-14T01:00:00.000Z"
  }
];

describe("external send parsing", () => {
  test("detects an explicit email destination in natural speech", () => {
    expect(
      parseExternalSendRequest("Please find that on the web and email me a link to freedom@agoperations.ca so I can view it.", recipients)
    ).toMatchObject({
      recipientId: null,
      recipientDestination: "freedom@agoperations.ca",
      matchReason: "explicit_email"
    });
  });

  test("detects a spoken-form email destination before falling back to the default recipient", () => {
    expect(
      parseExternalSendRequest("Please email me a link to freedom at agoperations dot ca so I can view it.", recipients)
    ).toMatchObject({
      recipientId: null,
      recipientDestination: "freedom@agoperations.ca",
      matchReason: "explicit_email"
    });
  });

  test("maps 'email me' to the only trusted recipient", () => {
    expect(parseExternalSendRequest("Can you email me the summary when you finish?", recipients)).toMatchObject({
      recipientId: "recipient-adam",
      recipientDestination: "adamgoodwin@shaw.ca",
      matchReason: "single_recipient_me"
    });
  });

  test("recognizes confirmation and cancellation voice commands", () => {
    expect(isExternalSendConfirmation("yes, send it")).toBe(true);
    expect(isExternalSendCancellation("cancel")).toBe(true);
  });
});
