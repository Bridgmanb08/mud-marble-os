import type { MouseEvent } from 'react';

export function openDatePicker(e: MouseEvent<HTMLInputElement>) {
  const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  input.showPicker?.();
}
