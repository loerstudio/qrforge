export type ChatRole = "user" | "assistant";

export interface QRSpec {
  redirectUrl: string;
  styleHint: string;
}

export interface Message {
  id: string;
  role: ChatRole;
  text: string;
  imageUrl?: string;
  attachmentDataUri?: string; // user-uploaded reference image (base64 inline)
  needsLink?: boolean;
  spec?: QRSpec;
  pending?: boolean;
}
