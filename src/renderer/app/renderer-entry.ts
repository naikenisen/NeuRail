import { groupInboxMailsByDate, type GroupedInbox, type InboxMail } from '@renderer/features/inbox/date-buckets';
import { getElectronApi } from '@renderer/ipc/electron-api.client';
import { fetchContacts, fetchState, persistState, type ContactEntry, type TodoState } from '@renderer/app/state-api';

export type RendererBootstrapState = {
  state: TodoState | null;
  contacts: ContactEntry[];
};

export async function bootstrapRendererState(): Promise<RendererBootstrapState> {
  const [state, contacts] = await Promise.all([fetchState(), fetchContacts()]);
  return { state, contacts };
}

export async function saveRendererState(state: TodoState): Promise<boolean> {
  return persistState(state);
}

export function groupInboxForUi(mails: InboxMail[]): GroupedInbox {
  return groupInboxMailsByDate(mails);
}

export function assertElectronBridgeAvailable(): void {
  void getElectronApi();
}
