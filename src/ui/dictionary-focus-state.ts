export function shouldAutoFocusDictionarySearch(isMobile: boolean): boolean {
  return !isMobile;
}

export function shouldBlurDictionarySearchAfterLookup(isMobile: boolean): boolean {
  return isMobile;
}
