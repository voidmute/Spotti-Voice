/// <reference types="vite/client" />

interface SetupProgress {
  phase: string;
  installDir?: string;
  copied?: number;
  total?: number;
  copiedBytes?: number;
  totalBytes?: number;
  currentFile?: string;
}

interface SetupMeta {
  ok: boolean;
  error?: string;
  version?: string;
  defaultDir?: string;
  fileCount?: number;
  payloadBytes?: number;
  logPath?: string;
}

interface Window {
  spottiSetup?: {
    isSetupShell?: boolean;
    getMeta: () => Promise<SetupMeta>;
    getLogPath: () => Promise<string>;
    pickInstallDir: () => Promise<{ cancelled: boolean; path: string | null }>;
    install: (options: {
      installDir: string;
      desktopShortcut?: boolean;
      startMenuShortcut?: boolean;
      launchAfter?: boolean;
    }) => Promise<{ ok: boolean; installDir?: string; cancelled?: boolean }>;
    cancel: () => Promise<boolean>;
    minimize: () => Promise<boolean>;
    maximize: () => Promise<boolean>;
    close: () => Promise<boolean>;
    onProgress: (handler: (payload: SetupProgress) => void) => () => void;
  };
}
