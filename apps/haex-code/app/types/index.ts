export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isExpanded?: boolean;
  children?: FileEntry[];
  depth: number;
}

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export interface TerminalTab {
  id: string;
  name: string;
  sessionId: string | null;
  shell?: string;
}
