export type ChatRole = "user" | "assistant";

export interface QRSpec {
  redirectUrl: string;
  styleHint: string;
}

export interface AssistantPayload {
  text: string;
  spec?: QRSpec;
  needsLink?: boolean;
  imageUrl?: string;
  pending?: boolean;
}

export interface Message {
  id: string;
  role: ChatRole;
  text: string;
  imageUrl?: string;
  needsLink?: boolean;
  spec?: QRSpec;
  pending?: boolean;
}
