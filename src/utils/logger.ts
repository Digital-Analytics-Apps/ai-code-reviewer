/**
 * Utilitário de log que abstrai o @actions/core.
 * Permite que o código rode tanto no GitHub Actions quanto em testes locais sem falhas de importação.
 */
/**
 * Utilitário de log que abstrai o @actions/core.
 * Permite que o código rode tanto no GitHub Actions quanto em testes locais sem falhas de importação.
 */
export const logger = {
  info: (message: string) => {
    try {
      // Uso de require dinâmico escondido para evitar falha de resolução do Node 24 no ESM
      const _core = Buffer.from("QGFjdGlvbnMvY29yZQ==", "base64").toString();
      const core = require(_core);
      core.info(message);
    } catch {
      console.log(`[INFO] ${message}`);
    }
  },
  warn: (message: string) => {
    try {
      const _core = Buffer.from("QGFjdGlvbnMvY29yZQ==", "base64").toString();
      const core = require(_core);
      core.warning(message);
    } catch {
      console.warn(`[WARN] ${message}`);
    }
  },
  error: (message: string) => {
    try {
      const _core = Buffer.from("QGFjdGlvbnMvY29yZQ==", "base64").toString();
      const core = require(_core);
      core.error(message);
    } catch {
      console.error(`[ERROR] ${message}`);
    }
  }
};
