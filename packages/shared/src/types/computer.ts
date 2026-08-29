export type ComputerMouseButton = "left" | "right" | "middle";

export type ComputerScrollDirection = "up" | "down" | "left" | "right";

export type ComputerAction =
  | { action: "move"; x: number; y: number }
  | { action: "click"; x: number; y: number; button?: ComputerMouseButton; clicks?: number }
  | { action: "type"; text: string }
  | { action: "key"; combo: string }
  | { action: "scroll"; direction: ComputerScrollDirection; amount?: number };

export interface ComputerScreenshot {
  pngBase64: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export interface ComputerControlSession {
  id: string;
  nodeId: string;
  ownerSessionId: string;
  status: "active";
  createdAt: string;
  expiresAt: string;
}

export interface ComputerTarget {
  nodeId: string;
  name: string;
  platform: string;
  available: boolean;
  reason?: string;
}
