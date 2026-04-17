export type VaultNodeType = 'md' | 'attachment' | 'orphan';

export type VaultNode = {
  id: string;
  label: string;
  path: string;
  type: VaultNodeType;
  tags: string[];
  group: string;
  date?: string | null;
};

export type VaultEdge = {
  source: string;
  target: string;
};

export type VaultGraph = {
  nodes: VaultNode[];
  edges: VaultEdge[];
};

export type SafeVaultPath = {
  safe: string;
  fullPath: string;
};
