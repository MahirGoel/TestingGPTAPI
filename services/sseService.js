let clients = {}; // Store clients by ID

function addClient(clientId, res) {
    clients[clientId] = res;
    console.log(`Client connected: ${clientId}`);

    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*' // Allow requests from any origin (adjust if needed for security)
    });

    // Send a connection confirmation message
    sendMessage(clientId, 'connected', { message: 'SSE connection established.' });

    // Handle client disconnect
    res.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        delete clients[clientId];
    });

    // Keep connection alive by sending periodic comments (optional but good practice)
    const keepAliveInterval = setInterval(() => {
        if (clients[clientId]) {
            clients[clientId].write(': keep-alive\n\n');
        } else {
            clearInterval(keepAliveInterval);
        }
    }, 20000); // Send keep-alive every 20 seconds
}

function sendMessage(clientId, event, data) {
    const client = clients[clientId];
    if (client) {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        // console.log(`Sending to ${clientId}: ${message}`); // Uncomment for debug
        client.write(message);
    } else {
        console.warn(`Attempted to send message to non-existent client: ${clientId}`);
    }
}

function removeClient(clientId) {
     if (clients[clientId]) {
        clients[clientId].end(); // End the response stream
        delete clients[clientId];
        console.log(`Client connection closed explicitly: ${clientId}`);
    }
}

module.exports = {
    addClient,
    sendMessage,
    removeClient
}; 