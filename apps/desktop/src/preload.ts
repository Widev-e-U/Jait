export const allowedIpcChannels = {
  invoke: ["desktop:get-state", "desktop:notify", "terminal:start"],
  on: ["gateway:event", "activity:event"],
} as const;

export type AllowedInvokeChannel = (typeof allowedIpcChannels.invoke)[number];
export type AllowedOnChannel = (typeof allowedIpcChannels.on)[number];
