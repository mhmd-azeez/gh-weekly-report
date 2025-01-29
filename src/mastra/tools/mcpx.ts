import { Session } from '@dylibso/mcpx';
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { jsonSchemaToZod } from "json-schema-to-zod";
import { zodToJsonSchema } from 'openai-zod-to-json-schema';

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

interface SchemaStats {
  totalProps: number;
  nestingLevel: number;
  enumValues: Set<string>;
  totalStringLength: number;
}

// Convert JSON schema to Zod schema while also making sure it doesn't exceed OpenAI limits
// See: https://platform.openai.com/docs/guides/structured-outputs/supported-schemas
function convertToZodSchema(schema: Record<string, any>, stats: SchemaStats = { 
  totalProps: 0,
  nestingLevel: 0,
  enumValues: new Set(),
  totalStringLength: 0
}): z.ZodType {
  if (!schema || typeof schema !== 'object') {
    return z.object({}).passthrough();
  }

  // For non-object types
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
          schema.enum.forEach((value: string) => {
            stats.enumValues.add(value);
            stats.totalStringLength += value.length;
          });
          return z.enum(schema.enum as [string, ...string[]]);
        }
        return z.string();
      case 'number':
      case 'integer':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'array':
        return z.array(convertToZodSchema(schema.items, {
          ...stats,
          nestingLevel: stats.nestingLevel + 1
        }));
      default:
        return z.any();
    }
  }

  // Handle object type
  const properties = schema.properties || {};
  const zodSchema: Record<string, z.ZodType> = {};
  const required = schema.required || [];

  // Track total properties
  stats.totalProps += Object.keys(properties).length;
  if (stats.totalProps > 100) {
    throw new Error('Schema exceeds maximum of 100 total properties');
  }

  for (const [key, prop] of Object.entries(properties)) {
    const value = prop as Record<string, any>;
    let fieldSchema: z.ZodType;

    const nextStats = {
      ...stats,
      nestingLevel: stats.nestingLevel + 1
    };

    // Convert the property type
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
        fieldSchema = z.array(convertToZodSchema(value.items, nextStats));
        break;
      case 'object':
        fieldSchema = convertToZodSchema(value, nextStats);
        break;
      default:
        fieldSchema = z.any();
    }

    // Keep the original required/optional state
    if (!required.includes(key)) {
      fieldSchema = fieldSchema.nullable();
    }

    // Add description if present
    if (value.description) {
      fieldSchema = fieldSchema.describe(value.description);
    }

    zodSchema[key] = fieldSchema;
  }

  // Create object and preserve original additionalProperties setting
  const result = z.object(zodSchema);
  if (schema.additionalProperties === false) {
    (result as any)._def.unknownKeys = 'strip';
  }

  return result;
}

export async function getMcpxTools(session: Session) {
  try {
    // Get all available tools from MCPX
    const { tools: mcpxTools } = await session.handleListTools({
      method: 'tools/list'
    }, {} as any);

    // Convert MCPX tools to Mastra tools
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

            // Handle MCPX content array
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

    // Convert array of tools to record
    return tools.reduce((acc, tool) => ({
      ...acc,
      [tool.id]: tool
    }), {});
  } catch (error) {
    console.error('Error getting MCPX tools:', error);
    throw error;
  }
}