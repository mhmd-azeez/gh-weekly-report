import { Session } from '@dylibso/mcpx';
import { createTool } from '@mastra/core';
import { z } from 'zod';

interface MCPXTool {
  name: string;
  description?: string;
  inputSchema: Record<string, any>;
}

interface MCPXCallResult {
  content?: Array<{
    type: string;
    text: string;
  }>;
}

// Converts a JSON schema to a Zod schema tailored for OpenAPI's structured output schema
// See: https://platform.openai.com/docs/guides/structured-outputs/supported-schemas
function convertToZodSchema(schema: Record<string, any>): z.ZodType {
  if (!schema || typeof schema !== 'object') {
    return z.object({}).passthrough();
  }

  if (schema.type !== 'object') {
    if (Array.isArray(schema.type)) {
      if (schema.type.includes('null')) {
        const mainType = schema.type.find(t => t !== 'null');
        switch (mainType) {
          case 'string':
            return z.string().nullable();
          case 'number':
          case 'integer':
            return z.number().nullable();
          case 'boolean':
            return z.boolean().nullable();
          default:
            return z.any().nullable();
        }
      }
      return z.any();
    }

    switch (schema.type) {
      case 'string':
        if (schema.enum) {
          return z.enum(schema.enum as [string, ...string[]]);
        }
        return z.string();
      case 'number':
      case 'integer':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'array':
        return z.array(convertToZodSchema(schema.items));
      default:
        return z.any();
    }
  }

  const properties = schema.properties || {};
  const zodSchema: Record<string, z.ZodType> = {};
  const required = schema.required || [];

  for (const [key, prop] of Object.entries(properties)) {
    const value = prop as Record<string, any>;
    let fieldSchema: z.ZodType;

    switch (value.type) {
      case 'string':
        fieldSchema = value.enum 
          ? z.enum(value.enum as [string, ...string[]]) 
          : z.string();
        break;
      case 'number':
      case 'integer':
        fieldSchema = z.number();
        break;
      case 'boolean':
        fieldSchema = z.boolean();
        break;
      case 'array':
        fieldSchema = z.array(convertToZodSchema(value.items));
        break;
      case 'object':
        fieldSchema = convertToZodSchema(value);
        break;
      default:
        fieldSchema = z.any();
    }

    if (!required.includes(key)) {
      fieldSchema = fieldSchema.nullable();
    }

    if (value.description) {
      fieldSchema = fieldSchema.describe(value.description);
    }

    zodSchema[key] = fieldSchema;
  }

  const result = z.object(zodSchema);
  if (schema.additionalProperties === false) {
    (result as any)._def.unknownKeys = 'strip';
  }

  return result;
}

export async function getMcpxTools(session: Session) {
  try {
    const { tools: mcpxTools } = await session.handleListTools({
      method: 'tools/list'
    }, {} as any);

    const tools = mcpxTools.map((mcpxTool: MCPXTool) => {
      const zodSchema = convertToZodSchema(mcpxTool.inputSchema);

      return createTool({
        id: mcpxTool.name,
        description: mcpxTool.description || '',
        inputSchema: zodSchema,
        execute: async ({ context }) => {
          try {
            const result = await session.handleCallTool({
              method: 'tools/call',
              params: {
                name: mcpxTool.name,
                arguments: context
              }
            }, {} as any) as MCPXCallResult;

            if (!result) return null;

            if (result.content) {
              return result.content.reduce((acc, item) => {
                if (item.type === 'text') {
                  try {
                    return { ...acc, ...JSON.parse(item.text) };
                  } catch {
                    return { ...acc, text: item.text };
                  }
                }
                return acc;
              }, {});
            }

            return result;
          } catch (error) {
            console.error(`Error executing tool ${mcpxTool.name}:`, error);
            throw error;
          }
        }
      });
    });

    return tools.reduce((acc, tool) => ({
      ...acc,
      [tool.id]: tool
    }), {});
  } catch (error) {
    console.error('Error getting MCPX tools:', error);
    throw error;
  }
}