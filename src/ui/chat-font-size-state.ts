export const MIN_CHAT_FONT_SIZE_PX = 12;
export const MAX_CHAT_FONT_SIZE_PX = 24;
export const DEFAULT_CHAT_FONT_SIZE_PX = 13;

export function normalizeChatFontSize(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_CHAT_FONT_SIZE_PX;
  }
  return Math.min(MAX_CHAT_FONT_SIZE_PX, Math.max(MIN_CHAT_FONT_SIZE_PX, Math.round(value)));
}

export function adjustChatFontSize(current: number, delta: number): number {
  return normalizeChatFontSize(current + delta);
}
