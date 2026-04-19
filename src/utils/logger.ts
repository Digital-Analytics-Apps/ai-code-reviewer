/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Utilitário de log que abstrai o @actions/core.
 * Permite que o código rode tanto no GitHub Actions quanto em testes locais.
 */
export const logger = {
  info: (message: string, ...args: any[]) => {
    const formatted = args.length
      ? `${message} ${JSON.stringify(args)}`
      : message;
    try {
      const _core = Buffer.from("QGFjdGlvbnMvY29yZQ==", "base64").toString();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const core = require(_core);
      core.info(formatted);
    } catch {
      console.log(`[INFO] ${formatted}`);
    }
  },
  warn: (message: string, ...args: any[]) => {
    const formatted = args.length
      ? `${message} ${JSON.stringify(args)}`
      : message;
    try {
      const _core = Buffer.from("QGFjdGlvbnMvY29yZQ==", "base64").toString();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const core = require(_core);
      core.warning(formatted);
    } catch {
      console.warn(`[WARN] ${formatted}`);
    }
  },
  error: (message: string, ...args: any[]) => {
    const formatted = args.length
      ? `${message} ${JSON.stringify(args)}`
      : message;
    try {
      const _core = Buffer.from("QGFjdGlvbnMvY29yZQ==", "base64").toString();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const core = require(_core);
      core.error(formatted);
    } catch {
      console.error(`[ERROR] ${formatted}`);
    }
  },
};
