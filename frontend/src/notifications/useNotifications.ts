import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot } from './notificationsStore';
import type { AppNotification } from '../types';

export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
