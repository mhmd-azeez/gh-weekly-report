import { Agent } from '@mastra/core';
import { getMcpxTools } from '../tools/mcpx';
import { Session } from '@dylibso/mcpx';

export const createGitHubAgent = async (session: Session) => {
  console.log('getting mcpx tools');
  const mcpxTools = await getMcpxTools(session);

  console.log('tools count:', Object.keys(mcpxTools).length);
  return new Agent({
    name: 'Github Agent',
    instructions: `
        You are a helpful github assistant that provides accurate github information.
  
        Use all of the gh-* tools to help users with their github needs.
  `,
    model: {
      provider: 'OPEN_AI',
      name: 'gpt-4o',
      toolChoice: 'auto',
    },
    tools: mcpxTools,
  });
  
}