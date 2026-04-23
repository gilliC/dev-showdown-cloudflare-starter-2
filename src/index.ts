import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const INTERACTION_ID_HEADER = 'X-Interaction-Id';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method !== 'POST' || url.pathname !== '/api') {
			return new Response('Not Found', { status: 404 });
		}

		const challengeType = url.searchParams.get('challengeType');
		if (!challengeType) {
			return new Response('Missing challengeType query parameter', {
				status: 400,
			});
		}

		const interactionId = request.headers.get(INTERACTION_ID_HEADER);
		if (!interactionId) {
			return new Response(`Missing ${INTERACTION_ID_HEADER} header`, {
				status: 400,
			});
		}

		const payload = await request.json<any>();

		switch (challengeType) {
			case 'HELLO_WORLD':
				return Response.json({
					greeting: `Hello ${payload.name}`,
				});
			case 'BASIC_LLM': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}

				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: 'You are a trivia question player. Answer the question correctly and concisely.',
					prompt: payload.question,
				});

				return Response.json({
					answer: result.text || 'N/A',
				});
			}
			case 'JSON_MODE': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}
				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: 'You will be given a human-readable description of a product and must return the extracted data as a JSON object. The wording and sentence order will vary, but every required fact is present in the text. You must return: name, price, currency,inStock,dimensions, manufacturer, specifications',
					prompt: payload.question,
				});
				return Response.json({
					answer: result.text || 'N/A',
				});
			}
			case 'BASIC_TOOL_CALL': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}
				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const cityResponse = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: 'You are a helpful assistant that extracts the city from a question. If the city is not mentioned, respond with "Unknown".',
					prompt: payload.question,
				});
				const city = cityResponse.text?.trim() || 'Unknown';
				const weatherResponse = await fetch('https://devshowdown.com/api/weather', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ city }),
				});
				const chatResponse = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: 'You are a helpful assistant that provides weather information. Use the provided weather data to answer the user\'s question.',
					prompt: `User's question: ${payload.question}\nExtracted city: ${city}\nWeather data: ${await weatherResponse.text()}`,
				});
				return Response.json({
					answer: chatResponse.text || 'N/A',
				});

			}
			default:
				return new Response('Solver not found', { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;

function createWorkshopLlm(apiKey: string, interactionId: string) {
	return createOpenAICompatible({
		name: 'dev-showdown',
		baseURL: 'https://devshowdown.com/v1',
		supportsStructuredOutputs: true,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			[INTERACTION_ID_HEADER]: interactionId,
		},
	});
}
