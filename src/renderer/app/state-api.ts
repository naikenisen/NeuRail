export type TodoState = {
  sections?: unknown[];
  settings?: Record<string, unknown>;
  reminders?: unknown[];
  mailEvents?: unknown[];
  archives?: unknown[];
};

export type ContactEntry = {
  name?: string;
  email?: string;
};

export async function fetchState(): Promise<TodoState | null> {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) return null;
    return (await response.json()) as TodoState;
  } catch {
    return null;
  }
}

export async function fetchContacts(): Promise<ContactEntry[]> {
  try {
    const response = await fetch('/api/contacts');
    if (!response.ok) return [];
    const payload = (await response.json()) as unknown;
    return Array.isArray(payload) ? (payload as ContactEntry[]) : [];
  } catch {
    return [];
  }
}

export async function persistState(state: TodoState): Promise<boolean> {
  try {
    const response = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return response.ok;
  } catch {
    return false;
  }
}
