// AI Service for text improvement using OpenAI GPT-4o-mini

import { getConfig, setConfig } from './database';
import { BlockNoteBlock, extractBlockNoteText } from '@/lib/content';

const CONFIG_KEY = 'openai_api_key';

export async function getApiKey(): Promise<string | null> {
  return getConfig(CONFIG_KEY);
}

export async function setApiKey(key: string): Promise<void> {
  await setConfig(CONFIG_KEY, key);
}

export async function hasApiKey(): Promise<boolean> {
  const key = await getConfig(CONFIG_KEY);
  return !!key && key.length > 0;
}

export const DEFAULT_NOTES_PROMPT = `You are a helpful assistant that improves text in BlockNote editor JSON format.

CRITICAL RULES:
1. You will receive a JSON array of BlockNote blocks
2. ONLY modify the "text" values inside "content" arrays
3. KEEP ALL other properties EXACTLY as they are (id, type, props, styles, children, etc.)
4. ALWAYS respond in the SAME LANGUAGE as the input text
5. Fix grammar, spelling, and improve style
6. Keep the original meaning intact
7. Preserve technical terms, code references, API names, variable names exactly
8. Return ONLY valid JSON - no explanations, no markdown code blocks, just the JSON array

Example input:
[{"id":"1","type":"paragraph","props":{},"content":[{"type":"text","text":"Teh qiuck brown fox","styles":{"bold":true}}],"children":[]}]

Example output:
[{"id":"1","type":"paragraph","props":{},"content":[{"type":"text","text":"The quick brown fox","styles":{"bold":true}}],"children":[]}]`;

export const DEFAULT_TASKS_PROMPT = `You are a helpful assistant that improves text in BlockNote editor JSON format.

CRITICAL RULES:
1. You will receive a JSON array of BlockNote blocks
2. ONLY modify the "text" values inside "content" arrays
3. KEEP ALL other properties EXACTLY as they are (id, type, props, styles, children, etc.)
4. ALWAYS respond in the SAME LANGUAGE as the input text
5. Fix grammar, spelling, and improve style
6. Keep the original meaning intact
7. Preserve technical terms, code references, API names, variable names exactly
8. Return ONLY valid JSON - no explanations, no markdown code blocks, just the JSON array

Example input:
[{"id":"1","type":"paragraph","props":{},"content":[{"type":"text","text":"Teh qiuck brown fox","styles":{"bold":true}}],"children":[]}]

Example output:
[{"id":"1","type":"paragraph","props":{},"content":[{"type":"text","text":"The quick brown fox","styles":{"bold":true}}],"children":[]}]`;

export async function improveText(blocksJson: string, customPrompt?: string): Promise<string> {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('No API key configured');
  }

  let blocks: BlockNoteBlock[];
  try {
    blocks = JSON.parse(blocksJson);
  } catch {
    throw new Error('Invalid BlockNote content');
  }

  const originalText = extractBlockNoteText(blocks);

  if (!originalText.trim()) {
    return blocksJson; // Return original if empty
  }

  // Send the full JSON structure to AI for modification
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: customPrompt || DEFAULT_NOTES_PROMPT,
        },
        {
          role: 'user',
          content: blocksJson,
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(error.error?.message || `API Error: ${response.status}`);
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = await response.json() as { choices?: { message?: { content?: string } }[] };
  } catch {
    throw new Error('AI returned invalid JSON response');
  }
  let improvedJson = data.choices?.[0]?.message?.content?.trim();

  if (!improvedJson) {
    throw new Error('No response from AI');
  }

  // Clean up response if AI wrapped it in markdown code blocks
  if (improvedJson.startsWith('```')) {
    improvedJson = improvedJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  // Validate that it's valid JSON
  try {
    JSON.parse(improvedJson);
  } catch {
    throw new Error('AI returned invalid JSON');
  }

  return improvedJson;
}
