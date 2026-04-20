/* eslint-disable @typescript-eslint/no-explicit-any */
import * as core from "@actions/core";

/**
 * Utilitário de log que abstrai o @actions/core.
 * Permite que o código rode de forma integrada com a interface do GitHub Actions.
 */
export const logger = {
  info: (message: string) => {
    core.info(message);
  },
  warn: (message: string, error?: any) => {
    core.warning(message);
    if (error) core.debug(`Error detail: ${JSON.stringify(error)}`);
  },
  error: (message: string, error?: any) => {
    core.error(message);
    if (error) {
      if (error instanceof Error) {
        core.debug(error.stack || error.message);
      } else {
        core.debug(JSON.stringify(error));
      }
    }
  },
  debug: (message: string) => {
    core.debug(message);
  },
  startGroup: (name: string) => {
    core.startGroup(name);
  },
  endGroup: () => {
    core.endGroup();
  },
};
