import { Session } from '@dylibso/mcpx';
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { jsonSchemaToZod } from "json-schema-to-zod";

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

// Helper function to convert MCP JSON Schema to Zod schema
function convertToZodSchema(schema: Record<string, any>): z.ZodType {

  if (!schema || typeof schema !== 'object') {
    return z.object({}).passthrough();
  }

  if (schema.properties) {
    schema.required = Object.entries(schema.properties)
      .map(([key]) => key);
  }

  if (schema.type === 'object') {
    const properties = schema.properties || {};
    const zodSchema: Record<string, z.ZodType> = {};

    for (const [key, value] of Object.entries(properties)) {
      const prop = value as Record<string, any>;
      let fieldSchema: z.ZodType;

      switch (prop.type) {
        case 'string':
          fieldSchema = z.string();
          if (prop.enum) {
            fieldSchema = z.enum(prop.enum as [string, ...string[]]);
          }
          break;
        case 'number':
          let number = z.number().min(prop.minimum).max(prop.maximum);
          if (typeof prop.minimum === 'number') {
            number = number.min(prop.minimum);
          }
          if (typeof prop.maximum === 'number') {
            number = number.max(prop.maximum);
          }

          fieldSchema = number;
          break;
        case 'integer':
          fieldSchema = z.number().int();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'array':
          const itemSchema = convertToZodSchema(prop.items);
          fieldSchema = z.array(itemSchema);
          break;
        case 'object':
          fieldSchema = convertToZodSchema(prop);
          break;
        default:
          fieldSchema = z.any();
      }

      // Handle optional fields and defaults
      if (!schema.required?.includes(key)) {
        if ('default' in prop) {
          fieldSchema = fieldSchema.default(prop.default);
        } else {
          fieldSchema = fieldSchema.optional();
        }
      }
      if (prop.description) {
        fieldSchema = fieldSchema.describe(prop.description);
      }

      zodSchema[key] = fieldSchema;
    }

    return z.object(zodSchema).strict();
  }

  // Handle non-object types at the top level
  switch (schema.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(convertToZodSchema(schema.items));
    default:
      return z.any();
  }
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