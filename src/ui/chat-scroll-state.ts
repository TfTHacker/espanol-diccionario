const DEFAULT_MESSAGE_TOP_PADDING_PX = 8;

export function getScrollTopForMessageTop(
  currentScrollTop: number,
  containerClientHeight: number,
  messageOffsetTop: number,
  messageOffsetHeight: number,
  topPadding: number = DEFAULT_MESSAGE_TOP_PADDING_PX,
): number {
  const targetTop = Math.max(0, messageOffsetTop - topPadding);
  const visibleTop = currentScrollTop + topPadding;
  const visibleBottom = currentScrollTop + containerClientHeight;
  const messageBottom = messageOffsetTop + messageOffsetHeight;

  if (messageOffsetTop >= visibleTop && messageBottom <= visibleBottom) {
    return currentScrollTop;
  }

  return targetTop;
}

export function scrollMessageTopIntoView(
  container: HTMLElement,
  messageEl: HTMLElement,
  topPadding: number = DEFAULT_MESSAGE_TOP_PADDING_PX,
): void {
  const containerRect = container.getBoundingClientRect();
  const messageRect = messageEl.getBoundingClientRect();
  const messageTop = messageRect.top - containerRect.top + container.scrollTop;

  container.scrollTop = getScrollTopForMessageTop(
    container.scrollTop,
    container.clientHeight,
    messageTop,
    messageRect.height,
    topPadding,
  );
}
