// Labels that start a change. Navigation, search, and log out are not in here.
const WRITE_LABEL = /^(new|add|edit|save|delete|remove|create|post|upload|log visit|move to|record|send|import|convert|archive|restore|drop|share a pulse|mark complete|reset password)/i;

export function isWriteButton(btn: HTMLButtonElement): boolean {
  if (btn.dataset.allowViewer === 'true') return false;
  const label = `${btn.getAttribute('aria-label') || ''} ${btn.textContent || ''}`.replace(/\s+/g, ' ').trim();
  if (/log out/i.test(label)) return false;
  if (btn.classList.contains('btn-p') || btn.type === 'submit') return true;
  return WRITE_LABEL.test(label);
}
