import { mastra } from './mastra';

const agent = mastra.getAgent('gitHubAgent');

const response = await agent.generate('What are some of the interesting issues on the tenserflow repo?');
console.log(response.text);
