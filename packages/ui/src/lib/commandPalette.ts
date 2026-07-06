export const OPEN_COMMAND_PALETTE_EVENT = "zerotrust:open-command-palette";

export function openCommandPalette(): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}
