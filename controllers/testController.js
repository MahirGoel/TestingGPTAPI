const openaiService = require('../services/openaiService');
const sseService = require('../services/sseService');

// Handle starting the test
exports.startTest = (req, res, next) => {
    try {
        const { model, prompt, maxTokens, numRequests, temperature, topP, sseClientId } = req.body;

        // Basic validation (can be expanded)
        if (!model || !prompt || !maxTokens || !numRequests || !temperature || !topP || !sseClientId) {
            return res.status(400).json({ error: 'Missing required parameters.' });
        }

        // Convert types where necessary
        const params = {
            model,
            prompt,
            maxTokens: parseInt(maxTokens, 10),
            numRequests: parseInt(numRequests, 10),
            temperature: parseFloat(temperature),
            topP: parseFloat(topP),
            sseClientId
        };

        // Input value validation
        if (isNaN(params.maxTokens) || params.maxTokens <= 0 ||
            isNaN(params.numRequests) || params.numRequests <= 0 ||
            isNaN(params.temperature) || params.temperature < 0 || params.temperature > 2 ||
            isNaN(params.topP) || params.topP < 0 || params.topP > 1) {
             return res.status(400).json({ error: 'Invalid parameter values.' });
        }

        // Respond immediately to the POST request first
        res.status(202).json({ message: 'Test initiated successfully.', clientId: sseClientId });

        // THEN start the test asynchronously after a short delay
        // This gives the SSE connection a moment to establish fully
        setTimeout(() => {
             console.log(`[${new Date().toISOString()}] Starting test run for client: ${sseClientId}`);
             openaiService.runConcurrentTests(params).catch(err => {
                // Log any unhandled errors from the async test run
                console.error(`[${new Date().toISOString()}] Error during async runConcurrentTests for ${sseClientId}:`, err);
                // Optionally try to send an error message back via SSE if the client still exists
                 sseService.sendMessage(sseClientId, 'error', { message: 'An unexpected error occurred during the test run.' });
             });
        }, 200); // 200ms delay - adjust if needed

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in startTest controller:`, error);
        // Send error back to client who made the POST request
        res.status(500).json({ error: 'Failed to start test.' });
        // Also notify the SSE client if possible (might not be connected yet)
        if (req.body.sseClientId) {
            sseService.sendMessage(req.body.sseClientId, 'error', { message: 'Failed to initiate test on server.' });
        }
    }
};

// Handle SSE connections
exports.handleEvents = (req, res, next) => {
    const clientId = req.params.clientId;
    if (!clientId) {
        return res.status(400).send('Client ID is required.');
    }
    sseService.addClient(clientId, res);
}; 