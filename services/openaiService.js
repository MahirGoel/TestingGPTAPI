const OpenAI = require('openai');
const sseService = require('./sseService');
const fs = require('fs').promises; // For file system operations
const path = require('path'); // For path joining
const DATA_DIR = path.join(__dirname, '..', 'data'); // Path to data directory

// Ensure the API key is loaded from .env
if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY not found in environment variables.");
    console.error("Please ensure you have a .env file with OPENAI_API_KEY set.");
    // In a real app, you might exit or handle this more gracefully
    // For now, we proceed but API calls will fail.
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to send a single request and handle response/error
async function sendSingleRequest(requestNumber, model, prompt, maxTokens, temperature, topP, sseClientId) {
    const startTime = Date.now();
    const logPrefix = `[${new Date().toISOString()}] Request ${requestNumber}:`;

    sseService.sendMessage(sseClientId, 'log', { message: `${logPrefix} Sending... (Model: ${model}, Max Tokens: ${maxTokens}, Temp: ${temperature}, TopP: ${topP})` });

    try {
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: temperature,
            top_p: topP,
        });

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        const responseContent = completion.choices[0]?.message?.content || 'No content received';
        const usage = completion.usage; // { prompt_tokens, completion_tokens, total_tokens }
        const id = completion.id;
        const created = completion.created;

        const logMessage = `${logPrefix} Success in ${duration.toFixed(2)}s. Usage: ${usage?.total_tokens || 'N/A'} tokens.`;

        sseService.sendMessage(sseClientId, 'log', { message: logMessage });

        // Include new data points in the result sent via SSE
        const resultData = {
            requestNumber,
            status: 'Success',
            duration: duration.toFixed(2),
            response: responseContent.trim(),
            model: model,
            prompt: prompt,
            maxTokens: maxTokens,
            temperature: temperature,
            topP: topP,
            usage: usage, // Add usage object
            openai_id: id, // Add request ID
            openai_created: created // Add OpenAI timestamp
        };
        sseService.sendMessage(sseClientId, 'result', resultData);

        // FIX: Ensure the full resultData is returned for Promise.allSettled
        return resultData; // <-- Return the detailed object

    } catch (error) {
        const errorTime = Date.now();
        const duration = (errorTime - startTime) / 1000;
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        const logMessage = `${logPrefix} Error after ${duration.toFixed(2)}s: ${error.name || 'Error'}`;

        console.error(`${logPrefix} Error Details:`, error);
        sseService.sendMessage(sseClientId, 'log', { message: logMessage });

        // Include parameters in failure data for context
        const failureData = {
            requestNumber,
            status: 'Failed',
            duration: duration.toFixed(2),
            error: errorMessage,
            model: model,
            prompt: prompt,
            maxTokens: maxTokens,
            temperature: temperature,
            topP: topP
        };
        sseService.sendMessage(sseClientId, 'result', failureData);

        // FIX: Ensure the full failureData is returned for Promise.allSettled
        // We need to throw it so Promise.allSettled registers it as 'rejected'
        // Throwing the object itself makes it available in result.reason
        throw failureData; // <-- Throw the detailed object
    }
}

// Main function to run concurrent tests
async function runConcurrentTests(params) {
    const { model, prompt, maxTokens, numRequests, temperature, topP, sseClientId } = params;
    const requests = [];
    const mainStartTime = Date.now();

    sseService.sendMessage(sseClientId, 'log', { message: `[${new Date(mainStartTime).toISOString()}] Starting test: ${numRequests} concurrent requests...` });

    for (let i = 1; i <= numRequests; i++) {
        // Add a small delay between starting requests if needed to avoid immediate rate limits,
        // although Promise.allSettled handles the concurrency.
        // await new Promise(resolve => setTimeout(resolve, 10)); // Optional small delay
        requests.push(sendSingleRequest(i, model, prompt, maxTokens, temperature, topP, sseClientId));
    }

    // Now, results from Promise.allSettled will have the full objects
    const results = await Promise.allSettled(requests.map(p => p.catch(err => { throw err; }))); // Ensure promises reject correctly

    const mainEndTime = Date.now();
    const totalDuration = (mainEndTime - mainStartTime) / 1000;

    let successfulCount = 0;
    let failedCount = 0;
    const detailedResults = results.map(result => {
        if (result.status === 'fulfilled') {
            successfulCount++;
            return result.value; // result.value is now the full resultData
        } else {
            failedCount++;
            // result.reason should now be the full failureData object we threw
            return result.reason || { status: 'Failed', error: 'Unknown rejection reason' }; 
        }
    });

    // Structure the complete test data for saving
    const testRunData = {
        id: `test-${mainStartTime}`, // Unique ID for this test run
        timestamp: new Date(mainStartTime).toISOString(),
        parameters: { model, prompt, maxTokens, numRequests, temperature, topP },
        summary: {
            totalDuration: totalDuration.toFixed(2),
            successfulCount,
            failedCount,
            totalRequests: numRequests
            // We can calculate avg response time here from detailedResults if needed
        },
        results: detailedResults // This now contains the full objects
    };

    // Send completion message via SSE
    const finalMessage = `[${new Date(mainEndTime).toISOString()}] Test complete. Total time: ${totalDuration.toFixed(2)}s. Successful: ${successfulCount}, Failed: ${failedCount}.`;
    sseService.sendMessage(sseClientId, 'log', { message: finalMessage });
    sseService.sendMessage(sseClientId, 'complete', testRunData.summary); // Send summary stats

    // Save the results asynchronously to its own file
    const filePath = path.join(DATA_DIR, `${testRunData.id}.json`);
    try {
        // Ensure data directory exists (optional, mkdir should have created it)
        // await fs.mkdir(DATA_DIR, { recursive: true });

        await fs.writeFile(filePath, JSON.stringify(testRunData, null, 2), 'utf8');
        console.log(`[${new Date().toISOString()}] Test run ${testRunData.id} saved successfully to ${filePath}`);

    } catch (saveError) {
        console.error(`[${new Date().toISOString()}] Error saving test run ${testRunData.id} to ${filePath}:`, saveError);
    }

    // Optionally close the SSE connection after completion
    // sseService.removeClient(sseClientId);
}

module.exports = {
    runConcurrentTests
}; 