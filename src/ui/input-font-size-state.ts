export const MIN_INPUT_FONT_SIZE_PX = 12;
export const MAX_INPUT_FONT_SIZE_PX = 28;
export const DEFAULT_INPUT_FONT_SIZE_PX = 18;

export function normalizeInputFontSize(value: unknown): number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return DEFAULT_INPUT_FONT_SIZE_PX;
	}
	return Math.min(MAX_INPUT_FONT_SIZE_PX, Math.max(MIN_INPUT_FONT_SIZE_PX, Math.round(value)));
}
