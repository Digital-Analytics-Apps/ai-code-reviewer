import path from "path";

/**
 * Categorias de agentes disponíveis no sistema.
 */
export enum AgentCategory {
  SECURITY = "security",
  PERFORMANCE = "performance",
  ARCHITECTURE = "architecture",
  STYLE = "style",
  GENERAL = "general",
}

export interface TriageResult {
  language: string;
  framework?: string;
  suggestedAgents: AgentCategory[];
}

/**
 * Serviço responsável por analisar metadados de arquivos e decidir
 * quais agentes devem ser acionados para a revisão.
 */
export class TriageService {
  /**
   * Realiza a triage heurística (Camada 1) com base na extensão e path.
   */
  public triageFile(filePath: string): TriageResult {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    // Baseline: Todo arquivo de código passa por Segurança e Arquitetura/Geral
    const result: TriageResult = {
      language: "unknown",
      suggestedAgents: [AgentCategory.SECURITY, AgentCategory.GENERAL],
    };

    // Mapeamento Heurístico
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      result.language = "typescript/javascript";
      result.suggestedAgents.push(AgentCategory.PERFORMANCE, AgentCategory.STYLE);
      
      if (filePath.includes("frontend") || fileName.includes("component")) {
        result.framework = "react/web";
      }
    } else if ([".py"].includes(ext)) {
      result.language = "python";
      result.suggestedAgents.push(AgentCategory.PERFORMANCE, AgentCategory.STYLE);
    } else if ([".go"].includes(ext)) {
      result.language = "go";
      result.suggestedAgents.push(AgentCategory.PERFORMANCE, AgentCategory.STYLE);
    } else if ([".sql"].includes(ext)) {
      result.language = "sql";
      result.suggestedAgents = [AgentCategory.SECURITY, AgentCategory.PERFORMANCE];
    } else if ([".yml", ".yaml", ".json"].includes(ext)) {
      result.language = "config";
      result.suggestedAgents = [AgentCategory.SECURITY]; // Check for hardcoded keys/secrets
    } else if ([".md"].includes(ext)) {
      result.language = "markdown";
      result.suggestedAgents = [AgentCategory.STYLE]; // Just style/typos
    }

    // Remove duplicatas por segurança
    result.suggestedAgents = [...new Set(result.suggestedAgents)];

    return result;
  }
}
