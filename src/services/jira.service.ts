import { logger } from "../utils/logger";

export interface JiraConfig {
  host: string;
  email: string;
  token: string;
  projectKey: string;
}

/**
 * Serviço de integração com o JIRA Software.
 */
export class JiraService {
  constructor(private config: JiraConfig) {}

  /**
   * Cria uma nova Issue no JIRA.
   */
  async createIssue(summary: string, description: string): Promise<string> {
    const url = `https://${this.config.host}/rest/api/3/issue`;
    const auth = Buffer.from(
      `${this.config.email}:${this.config.token}`,
    ).toString("base64");

    const body = {
      fields: {
        project: {
          key: this.config.projectKey,
        },
        summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: description,
                },
              ],
            },
          ],
        },
        issuetype: {
          name: "Bug",
        },
      },
    };

    try {
      logger.info(
        `🎫 Creating JIRA issue in project ${this.config.projectKey}...`,
      );

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Jira API error: ${JSON.stringify(errorData)}`);
      }

      const data = (await response.json()) as { key: string };
      logger.info(`✅ JIRA Issue created: ${data.key}`);
      return data.key;
    } catch (error) {
      logger.error(`❌ Failed to create JIRA issue: ${error}`);
      throw error;
    }
  }
}
