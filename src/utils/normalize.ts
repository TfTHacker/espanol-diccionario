// src/utils/normalize.ts — String normalization utilities for accent-insensitive search

/**
 * Strip Spanish diacritics from a string for accent-insensitive matching.
 *
 * Maps accented characters to their unaccented equivalents so that users
 * typing on an English keyboard (or unsure of accent placement) can still
 * find the correct Spanish words.
 *
 * - á → a, é → e, í → i, ó → o, ú → u, ü → u
 * - ñ → n (so "manana" finds "mañana", "ano" finds "año")
 * - Uppercase variants are also normalized
 *
 * @param text - The string to normalize
 * @returns The string with Spanish diacritics removed
 */
export function stripAccents(text: string): string {
	return text
		.replace(/á/g, "a")
		.replace(/é/g, "e")
		.replace(/í/g, "i")
		.replace(/ó/g, "o")
		.replace(/ú/g, "u")
		.replace(/ü/g, "u")
		.replace(/ñ/g, "n")
		.replace(/Á/g, "A")
		.replace(/É/g, "E")
		.replace(/Í/g, "I")
		.replace(/Ó/g, "O")
		.replace(/Ú/g, "U")
		.replace(/Ü/g, "U")
		.replace(/Ñ/g, "N");
}

/**
 * Check if a string contains any Spanish accented characters.
 * Used to determine whether accent-insensitive search is needed.
 */
export function hasAccents(text: string): boolean {
	return /[áéíóúüñÁÉÍÓÚÜÑ]/.test(text);
}