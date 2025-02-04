
import { Mastra } from '@mastra/core';
import { createLogger } from '@mastra/core/logger';
import { createGitHubAgent } from './agents';
import { Session } from '@dylibso/mcpx';

if (!process.env.MCPX_SESSION_ID) {
  throw new Error('MCPX_SESSION_ID environment variable is required');
}

const session = new Session({
  authentication: [
    ["cookie", `sessionId=${process.env.MCPX_SESSION_ID}`]
  ],
  activeProfile: 'mastra-ai'
});

const gitHubAgent = await createGitHubAgent(session);

export const mastra = new Mastra({
  workflows: {},
  agents: { gitHubAgent },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
