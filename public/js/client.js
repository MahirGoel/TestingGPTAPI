document.addEventListener('DOMContentLoaded', () => {
    // --- Get DOM Elements ---
    const testForm = document.getElementById('test-form');
    const startTestBtn = document.getElementById('start-test-btn');
    const loggerBox = document.getElementById('logger-box');
    const resultsTableBody = document.querySelector('#results-table tbody');
    const responsesRepeater = document.getElementById('responses-repeater');

    const modelSelect = document.getElementById('model-select');
    const promptInput = document.getElementById('prompt-input');
    const requestsInput = document.getElementById('requests-input');

    // Input Sliders & Value Displays & Containers
    const tokensSlider = document.getElementById('tokens-slider');
    const tokensValueSpan = document.getElementById('tokens-value');
    const tempSlider = document.getElementById('temp-slider');
    const tempValueSpan = document.getElementById('temp-value');
    const tempSliderGroup = document.getElementById('temp-slider-group'); // Get container
    const topPSlider = document.getElementById('top-p-slider');
    const topPValueSpan = document.getElementById('top-p-value');
    const topPSliderGroup = document.getElementById('top-p-slider-group'); // Get container

    // Stats Display Spans
    const totalRequestsSpan = document.getElementById('total-requests');
    const successfulRequestsSpan = document.getElementById('successful-requests');
    const failedRequestsSpan = document.getElementById('failed-requests');
    const totalTimeSpan = document.getElementById('total-time');
    const avgResponseTimeSpan = document.getElementById('avg-response-time');

    // Chart instances & Data
    let responseTimeChart = null;
    let responseTimeHistogramChart = null;
    let tokenUsageChart = null;
    let successRateChart = null;
    let eventSource = null;
    let clientId = null;
    let testData = {
        requestData: [],
        successCount: 0,
        failCount: 0,
        totalSent: 0
    };

    // Tab Elements
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const sortableHeaders = document.querySelectorAll('#results-table th.sortable');

    // --- UI Control Logic ---
    function toggleParameterVisibility() {
        const selectedModel = modelSelect?.value;
        if (selectedModel === 'o1' || selectedModel === 'o3-mini') {
            tempSliderGroup?.classList.add('hidden');
            topPSliderGroup?.classList.add('hidden');
        } else {
            tempSliderGroup?.classList.remove('hidden');
            topPSliderGroup?.classList.remove('hidden');
        }
    }

    // Add listener to model select dropdown
    if (modelSelect) {
        modelSelect.addEventListener('change', toggleParameterVisibility);
        // Initial check on page load
        toggleParameterVisibility();
    }

    // --- Initialize Slider Display Values & Add Listeners ---
    function setupSlider(slider, valueSpan) {
        if (slider && valueSpan) {
            valueSpan.textContent = slider.value; // Set initial display value
            slider.addEventListener('input', () => valueSpan.textContent = slider.value);
        } else {
            console.warn('Slider or Value Span not found for setup', slider, valueSpan);
        }
    }
    setupSlider(tokensSlider, tokensValueSpan);
    setupSlider(tempSlider, tempValueSpan);
    setupSlider(topPSlider, topPValueSpan);

    // --- Sorting State ---
    let currentSortKey = null;
    let currentSortDir = 'none'; // none, asc, desc

    // --- Tab Switching Logic ---
    if (tabButtons.length > 0 && tabPanels.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons and panels
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanels.forEach(panel => panel.classList.remove('active'));

                // Add active class to clicked button and corresponding panel
                button.classList.add('active');
                const targetTabId = button.getAttribute('data-tab');
                const targetPanel = document.getElementById(targetTabId);
                if (targetPanel) {
                    targetPanel.classList.add('active');
                }
            });
        });
    } else {
        console.warn('Tab buttons or panels not found. Tab functionality disabled.');
    }

    // --- Table Sorting Logic ---
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.getAttribute('data-sort-key');
            let newSortDir = 'asc';

            // Cycle through sort directions: none -> asc -> desc -> none
            if (sortKey === currentSortKey) {
                if (currentSortDir === 'asc') {
                    newSortDir = 'desc';
                } else if (currentSortDir === 'desc') {
                    newSortDir = 'none'; // Reset sort
                } else {
                    newSortDir = 'asc';
                }
            } else {
                newSortDir = 'asc'; // Default to asc for new key
            }

            currentSortKey = (newSortDir === 'none') ? null : sortKey;
            currentSortDir = newSortDir;

            console.log(`Sorting by: ${currentSortKey || 'requestNumber'}, Direction: ${currentSortDir}`);
            updateSortIndicators();
            repopulateTable(); // Repopulate based on current sort
        });
    });

    function updateSortIndicators() {
        sortableHeaders.forEach(header => {
            const key = header.getAttribute('data-sort-key');
            if (key === currentSortKey) {
                header.setAttribute('data-sort-dir', currentSortDir);
            } else {
                header.removeAttribute('data-sort-dir');
            }
        });
    }

    function sortData(data) {
        if (!currentSortKey || currentSortDir === 'none') {
            // Default sort by requestNumber ascending
            return [...data].sort((a, b) => a.requestNumber - b.requestNumber);
        }

        return [...data].sort((a, b) => {
            let valA, valB;

            if (currentSortKey === 'duration') {
                valA = parseFloat(a.duration ?? Infinity); // Treat null/NaN as largest
                valB = parseFloat(b.duration ?? Infinity);
            } else if (currentSortKey === 'tokens') {
                // Sort by total tokens, treat missing usage as 0 or largest?
                // Let's treat missing/failed as lowest (0)
                valA = a.usage?.total_tokens ?? 0;
                valB = b.usage?.total_tokens ?? 0;
            } else {
                // Fallback/default if needed
                return a.requestNumber - b.requestNumber;
            }
            
            // Handle potential NaN values after parsing
            if (isNaN(valA)) valA = (currentSortDir === 'asc' ? Infinity : -Infinity);
            if (isNaN(valB)) valB = (currentSortDir === 'asc' ? Infinity : -Infinity);


            if (valA < valB) {
                return currentSortDir === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return currentSortDir === 'asc' ? 1 : -1;
            }
            // If values are equal, maintain original relative order (or sort by request #)
            return a.requestNumber - b.requestNumber;
        });
    }

    function repopulateTable() {
        if (!resultsTableBody) return;
        console.log(`Repopulating table. Current data count: ${testData.requestData.length}`, testData.requestData); // Log array content
        resultsTableBody.innerHTML = ''; // Clear existing rows
        const sortedResults = sortData(testData.requestData);
        sortedResults.forEach(result => addResultToTable(result)); // addResultToTable function remains the same
    }

    // --- Form Submission Logic ---
    if (testForm) {
        testForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (startTestBtn) {
                 startTestBtn.disabled = true;
                 startTestBtn.textContent = 'Running Test...';
            }
            clearPreviousResults();

            // Generate a unique client ID
            clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

            const formData = new FormData(testForm);
            const testParams = Object.fromEntries(formData.entries());
            testParams.sseClientId = clientId;
            // Ensure numRequests exists before parsing
            testData.totalSent = testParams.numRequests ? parseInt(testParams.numRequests, 10) : 0;

            logMessage('Attempting to start test...');

            // Establish SSE connection first
            setupEventSource(clientId);

            // Send POST request
            try {
                logMessage(`Sending POST to /api/start-test with client ID: ${clientId}`);
                const response = await fetch('/api/start-test', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(testParams),
                });

                logMessage(`POST response status: ${response.status}`);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Could not parse error response.' }));
                    logMessage(`Error initiating test: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown server error'}`);
                    console.error('Test Initiation Error Response:', errorData);
                    resetUI();
                    if (eventSource) {
                        logMessage('Closing SSE connection due to POST error.');
                        eventSource.close();
                    }
                } else {
                    const successData = await response.json();
                    logMessage(`Test initiation request successful (Server confirmation: ${successData.message}). Waiting for logs via SSE...`);
                }
            } catch (error) {
                logMessage(`Network error during fetch to /api/start-test: ${error.message}`);
                console.error('Fetch Error:', error);
                resetUI();
                if (eventSource) {
                    logMessage('Closing SSE connection due to fetch error.');
                    eventSource.close();
                }
            }

            // Reset sort state on new test
            currentSortKey = null;
            currentSortDir = 'none';
            updateSortIndicators();
        });
    } else {
        console.error('Test form element (#test-form) not found!');
        logMessage('ERROR: Test form could not be found. Cannot initiate tests.');
    }

    // --- SSE Handling ---
    function setupEventSource(clientId) {
        if (eventSource) {
            eventSource.close();
        }
        logMessage(`Attempting to connect to SSE endpoint: /api/events/${clientId}`);
        eventSource = new EventSource(`/api/events/${clientId}`);

        eventSource.onopen = () => logMessage('SSE Connection established.');
        eventSource.onerror = (error) => {
            logMessage('SSE Connection error. Check network tab and server logs.');
            console.error('EventSource failed:', error);
            // Don't automatically reset UI here, maybe the server is just restarting
        };

        eventSource.addEventListener('log', handleLogEvent);
        eventSource.addEventListener('result', handleResultEvent);
        eventSource.addEventListener('complete', handleCompleteEvent);
        eventSource.addEventListener('error', handleErrorEvent); // Explicit server error
        eventSource.addEventListener('connected', (e) => {
             try {
                const data = JSON.parse(e.data);
                logMessage(`Server confirmation: ${data.message}`);
             } catch (parseError) {
                console.error('Failed to parse SSE connected message:', e.data, parseError);
             }
        });
    }

    function handleLogEvent(e) {
        try {
            const data = JSON.parse(e.data);
            logMessage(data.message);
        } catch (parseError) {
            console.error('Failed to parse SSE log message:', e.data, parseError);
            logMessage(`Received unparseable log message: ${e.data}`);
        }
    }

    function handleResultEvent(e) {
        try {
            const result = JSON.parse(e.data);
            addRawResultData(result);
            repopulateTable(); 
            addResponseToViewer(result);
            updateStats(result);
        } catch (parseError) {
            console.error('Failed to parse SSE result message:', e.data, parseError);
             logMessage(`Received unparseable result message: ${e.data}`);
        }
    }

    function handleCompleteEvent(e) {
        try {
            const data = JSON.parse(e.data);
            logMessage(`--- Test Run Complete ---`);
            if (totalTimeSpan) totalTimeSpan.textContent = `${data.totalDuration}s`;
            updateCharts(); 
        } catch (parseError) {
            console.error('Failed to parse SSE complete message:', e.data, parseError);
            logMessage(`Received unparseable complete message: ${e.data}`);
        }
        resetUI();
        if (eventSource) {
            eventSource.close();
            logMessage('SSE Connection closed by client on completion.');
        }
    }

    function handleErrorEvent(e) {
        try {
            const data = JSON.parse(e.data);
            logMessage(`SERVER ERROR: ${data.message}`);
        } catch (parseError) {
             console.error('Failed to parse SSE error message:', e.data, parseError);
             logMessage(`Received unparseable server error via SSE: ${e.data}`);
        }
        resetUI();
        if (eventSource) eventSource.close();
    }

    // New helper to just add data without sorting immediately
    function addRawResultData(result) {
         if (result.status === 'Success') {
            const durationNum = parseFloat(result.duration);
            if (!isNaN(durationNum)) {
                testData.requestData.push({ 
                    requestNumber: result.requestNumber, 
                    duration: durationNum,
                    usage: result.usage,
                    status: 'Success',
                    // Include other fields needed by addResultToTable/addResponseViewer
                    response: result.response, 
                    model: result.model,
                    prompt: result.prompt,
                    maxTokens: result.maxTokens,
                    temperature: result.temperature,
                    topP: result.topP,
                    openai_id: result.openai_id,
                    openai_created: result.openai_created
                });
            } else { console.warn(/*...*/); }
        } else {
             testData.requestData.push({ 
                requestNumber: result.requestNumber, 
                duration: null, 
                error: result.error,
                status: 'Failed',
                 // Include other fields
                model: result.model,
                prompt: result.prompt,
                maxTokens: result.maxTokens,
                temperature: result.temperature,
                topP: result.topP
            });
        }
    }

    // --- UI Update Functions ---
    function logMessage(message) {
        if (!loggerBox) return;
        const timestamp = new Date().toLocaleTimeString();
        loggerBox.textContent += `[${timestamp}] ${message}\n`;
        loggerBox.scrollTop = loggerBox.scrollHeight; // Auto-scroll
    }

    function clearPreviousResults() {
        if (loggerBox) loggerBox.textContent = 'Initializing new test...\n';
        if (resultsTableBody) resultsTableBody.innerHTML = '';
        if (responsesRepeater) responsesRepeater.innerHTML = '';
        if (totalRequestsSpan) totalRequestsSpan.textContent = '0';
        if (successfulRequestsSpan) successfulRequestsSpan.textContent = '0';
        if (failedRequestsSpan) failedRequestsSpan.textContent = '0';
        if (totalTimeSpan) totalTimeSpan.textContent = '0.00s';
        if (avgResponseTimeSpan) avgResponseTimeSpan.textContent = '0.00s';
        // Reset the request data array
        testData = { requestData: [], successCount: 0, failCount: 0, totalSent: 0 };
        if (responseTimeChart) responseTimeChart.destroy();
        if (successRateChart) successRateChart.destroy();
        if (responseTimeHistogramChart) responseTimeHistogramChart.destroy();
        if (tokenUsageChart) tokenUsageChart.destroy();
        responseTimeChart = null;
        responseTimeHistogramChart = null;
        tokenUsageChart = null;
        successRateChart = null;
        console.log('Previous results cleared.');
    }

    function resetUI() {
        if (startTestBtn) {
            startTestBtn.disabled = false;
            startTestBtn.textContent = 'Start Test';
        }
         console.log('UI reset.');
    }

    function addResultToTable(result) {
        if (!resultsTableBody) return;
        try {
            const row = resultsTableBody.insertRow();
            row.insertCell().textContent = result.requestNumber;
            const statusCell = row.insertCell();
            statusCell.textContent = result.status;
            statusCell.style.color = result.status === 'Success' ? 'green' : 'red';
            row.insertCell().textContent = result.duration ?? 'N/A'; // Time (Col 3)

            // FIX: Add Tokens Cell (Col 4)
            const tokensCell = row.insertCell();
            if (result.status === 'Success' && result.usage) {
                tokensCell.textContent = `${result.usage.completion_tokens ?? '-'}/${result.usage.prompt_tokens ?? '-'}/${result.usage.total_tokens ?? '-'}`;
                tokensCell.title = `Completion: ${result.usage.completion_tokens}, Prompt: ${result.usage.prompt_tokens}, Total: ${result.usage.total_tokens}`;
            } else {
                 tokensCell.textContent = '-';
            }

            // FIX: Add OpenAI ID Cell (Col 5)
            const idCell = row.insertCell();
            idCell.textContent = result.openai_id ? result.openai_id.substring(0, 15) + '...' : '-';
            idCell.title = result.openai_id ?? 'N/A';

            // FIX: Correctly add Snippet Cell (Col 6)
            const snippetCell = row.insertCell();
            const textToShow = String(result.status === 'Success' ? result.response : result.error || ''); // Ensure string
            snippetCell.textContent = textToShow.substring(0, 50) + (textToShow.length > 50 ? '...' : '');
            snippetCell.title = textToShow; // Full text on hover
        } catch (error) {
            console.error('Error adding result to table:', result, error);
        }
    }

    function addResponseToViewer(result) {
        if (result.status !== 'Success' || !responsesRepeater) return;
        try {
            const responseDiv = document.createElement('div');
            responseDiv.classList.add('response-box');
            responseDiv.id = `response-${result.requestNumber}`;

            const title = document.createElement('h3');
            title.textContent = `Response #${result.requestNumber}`;

            const meta = document.createElement('div');
            meta.classList.add('meta');
            meta.textContent = `Time: ${result.duration}s | Model: ${result.model} | Tokens: ${result.maxTokens} | Temp: ${result.temperature} | TopP: ${result.topP}`;

            const contentDiv = document.createElement('div');
            contentDiv.classList.add('content');
            const responseText = String(result.response || ''); // Ensure string
            if (window.marked && typeof window.marked.parse === 'function') {
                 contentDiv.innerHTML = marked.parse(responseText);
            } else {
                console.warn('marked.js not loaded or parse function not available. Displaying raw text.');
                const pre = document.createElement('pre');
                pre.textContent = responseText;
                contentDiv.appendChild(pre);
            }

            responseDiv.appendChild(title);
            responseDiv.appendChild(meta);
            responseDiv.appendChild(contentDiv);

            // Insert in order
            const existingResponses = responsesRepeater.children;
            let inserted = false;
            for (let i = 0; i < existingResponses.length; i++) {
                const existingNum = parseInt(existingResponses[i].id.split('-')[1], 10);
                if (result.requestNumber < existingNum) {
                    responsesRepeater.insertBefore(responseDiv, existingResponses[i]);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                responsesRepeater.appendChild(responseDiv);
            }
        } catch (error) {
            console.error('Error adding response to viewer:', result, error);
        }
    }

    function updateStats(result) {
        try {
            // Update total count regardless of status
            if (totalRequestsSpan) totalRequestsSpan.textContent = parseInt(totalRequestsSpan.textContent || '0') + 1;

            // Only update counts here, don't push to array
            if (result.status === 'Success') {
                testData.successCount++;
                // REMOVE: testData.requestData.push({ ... });
            } else {
                testData.failCount++;
                // REMOVE: testData.requestData.push({ ... });
            }
            
            // Update display spans
            if (successfulRequestsSpan) successfulRequestsSpan.textContent = testData.successCount;
            if (failedRequestsSpan) failedRequestsSpan.textContent = testData.failCount;

            // Calculate average only on valid durations from the *existing* array
            const validDurations = testData.requestData.map(d => d.duration).filter(d => d !== null);
            if (validDurations.length > 0) {
                const avgTime = validDurations.reduce((a, b) => a + b, 0) / validDurations.length;
                if (avgResponseTimeSpan) avgResponseTimeSpan.textContent = `${avgTime.toFixed(2)}s`;
            } else {
                // Handle case where there are no successful requests yet
                 if (avgResponseTimeSpan) avgResponseTimeSpan.textContent = '0.00s';
            }
        } catch (error) {
            console.error('Error updating stats:', result, error);
        }
    }

    // --- Charting Functions ---
    function updateCharts() {
        console.log("Updating charts with data:", testData);
        updateResponseTimeChart();
        updateResponseTimeHistogram();
        updateTokenUsageChart();
        updateSuccessRateChart();
    }

    function updateResponseTimeChart() {
        const canvas = document.getElementById('responseTimeChart');
        if (!canvas) {
            console.warn("Response time chart canvas not found.");
            return;
        }
        const ctx = canvas.getContext('2d');
        if (responseTimeChart) {
            responseTimeChart.destroy();
            responseTimeChart = null;
        }

        // Use testData.requestData now
        if (!testData.requestData || testData.requestData.length === 0) {
            console.log("No request data to chart response times.");
            // Optionally display a 'No data' message on the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.fillText('No response time data available.', canvas.width / 2, canvas.height / 2);
            return;
        }

        try {
            // Sort data by request number for plotting
            const sortedData = [...testData.requestData].sort((a, b) => a.requestNumber - b.requestNumber);

            // Use request number for labels and duration for data points
            const labels = sortedData.map(d => `Req ${d.requestNumber}`);
            const dataPoints = sortedData.map(d => d.duration);

            responseTimeChart = new Chart(ctx, {
                type: 'line', // Keep as line, or change to 'bar'
                data: {
                    labels: labels, // Use request numbers
                    datasets: [{
                        label: 'Response Time (s)',
                        data: dataPoints, // Use durations
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.1,
                        fill: true
                    }]
                },
                options: {
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Time (s)' } },
                        // Adjust x-axis title if needed
                        x: { title: { display: true, text: 'Request Number' } }
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Response Time Distribution' },
                        legend: { display: false } // Hide legend for single dataset
                    }
                }
            });
        } catch (error) {
            console.error("Error creating response time chart:", error);
        }
    }

    function updateResponseTimeHistogram() {
        const canvas = document.getElementById('responseTimeHistogramChart');
        if (!canvas) {
            console.warn("Response time histogram canvas not found.");
            return;
        }
        const ctx = canvas.getContext('2d');
        if (responseTimeHistogramChart) {
            responseTimeHistogramChart.destroy();
            responseTimeHistogramChart = null;
        }

        const durations = testData.requestData.map(d => d.duration).filter(d => d !== null && !isNaN(d));
        if (durations.length === 0) {
            console.log("No duration data for histogram.");
            // Display 'No data' message
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.fillText('No response time data available.', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Determine bins for the histogram
        const maxDuration = Math.max(...durations);
        const minDuration = Math.min(...durations);
        // Simple binning strategy: 10 bins or fewer if range is small
        const binCount = Math.min(10, Math.ceil(maxDuration)); 
        const binSize = binCount > 0 ? (maxDuration - minDuration + 0.01) / binCount : 1; // Add epsilon for max value
        
        const bins = Array(binCount).fill(0);
        const labels = Array(binCount).fill(0).map((_, i) => {
             const start = minDuration + i * binSize;
             const end = start + binSize;
             return `${start.toFixed(1)}-${end.toFixed(1)}s`;
        });

        durations.forEach(duration => {
            let binIndex = Math.floor((duration - minDuration) / binSize);
            // Handle edge case where duration equals maxDuration
            if (binIndex >= binCount) binIndex = binCount - 1; 
             if (binIndex >= 0 && binIndex < binCount) {
                 bins[binIndex]++;
             }
        });

        try {
            responseTimeHistogramChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Number of Requests',
                        data: bins,
                        backgroundColor: 'rgba(153, 102, 255, 0.6)', // Purple example color
                        borderColor: 'rgba(153, 102, 255, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Number of Requests' }, ticks: { stepSize: 1 } }, // Ensure integer steps
                        x: { title: { display: true, text: 'Response Time Bins (s)' } }
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Response Time Histogram' },
                        legend: { display: false }
                    }
                }
            });
        } catch (error) {
            console.error("Error creating response time histogram:", error);
        }
    }

    function updateTokenUsageChart() {
        const canvas = document.getElementById('tokenUsageChart');
        if (!canvas) {
            console.warn("Token usage chart canvas not found.");
            return;
        }
        const ctx = canvas.getContext('2d');
        if (tokenUsageChart) {
            tokenUsageChart.destroy();
            tokenUsageChart = null;
        }

        // Filter successful requests with usage data
        const successfulRequests = testData.requestData.filter(d => d.status === 'Success' && d.usage);
        if (successfulRequests.length === 0) {
            console.log("No token usage data to chart.");
            // Display 'No data' message
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.fillText('No token usage data available.', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Sort by request number for plotting
        successfulRequests.sort((a, b) => a.requestNumber - b.requestNumber);

        const labels = successfulRequests.map(d => `Req ${d.requestNumber}`);
        const completionTokens = successfulRequests.map(d => d.usage.completion_tokens);
        const promptTokens = successfulRequests.map(d => d.usage.prompt_tokens);
        const totalTokens = successfulRequests.map(d => d.usage.total_tokens);

        try {
            tokenUsageChart = new Chart(ctx, {
                type: 'line', // Or 'bar'
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Total Tokens',
                            data: totalTokens,
                            borderColor: 'rgb(255, 159, 64)', // Orange
                            backgroundColor: 'rgba(255, 159, 64, 0.2)',
                            yAxisID: 'y', // Use the primary y-axis
                            tension: 0.1,
                            fill: false
                        },
                        {
                            label: 'Completion Tokens',
                            data: completionTokens,
                            borderColor: 'rgb(54, 162, 235)', // Blue
                            backgroundColor: 'rgba(54, 162, 235, 0.2)',
                            hidden: true, // Optionally hide by default
                            yAxisID: 'y',
                            tension: 0.1,
                            fill: false
                        },
                        {
                            label: 'Prompt Tokens',
                            data: promptTokens,
                            borderColor: 'rgb(75, 192, 192)', // Teal (same as response time)
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            hidden: true, // Optionally hide by default
                            yAxisID: 'y',
                             tension: 0.1,
                             fill: false
                        }
                    ]
                },
                options: {
                    scales: {
                         y: { beginAtZero: true, title: { display: true, text: 'Tokens' }, position: 'left' },
                         x: { title: { display: true, text: 'Request Number' } }
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Token Usage per Request' },
                        legend: {
                            display: true, // Show legend to toggle datasets
                            position: 'top'
                        },
                         tooltip: {
                            mode: 'index', // Show tooltips for all datasets at that index
                            intersect: false,
                        }
                    }
                }
            });
        } catch (error) {
            console.error("Error creating token usage chart:", error);
        }
    }

    function updateSuccessRateChart() {
        const canvas = document.getElementById('successRateChart');
         if (!canvas) {
            console.warn("Success rate chart canvas not found.");
            return;
        }
        const ctx = canvas.getContext('2d');
        if (successRateChart) {
            successRateChart.destroy();
            successRateChart = null;
        }

        const totalProcessed = testData.successCount + testData.failCount;
        if (totalProcessed === 0) {
             console.log("No success/fail data to chart.");
             // Optionally display a 'No data' message on the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.fillText('No success/failure data available.', canvas.width / 2, canvas.height / 2);
             return;
        }

        try {
            successRateChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['Successful', 'Failed'],
                    datasets: [{
                        label: 'Request Outcomes',
                        data: [testData.successCount, testData.failCount],
                        backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)'],
                        borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
                        borderWidth: 1
                    }]
                },
                options: {
                     responsive: true,
                     maintainAspectRatio: false,
                     plugins: {
                        title: { display: true, text: 'Success vs. Failure Rate' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed !== null) {
                                        const percentage = totalProcessed > 0 ? ((context.parsed / totalProcessed) * 100).toFixed(1) : 0;
                                        label += `${context.parsed} (${percentage}%)`;
                                    }
                                    return label;
                                }
                            }
                        },
                        legend: {
                            position: 'top',
                        },
                     }
                }
            });
        } catch (error) {
            console.error("Error creating success rate chart:", error);
        }
    }

    // Initial UI setup log
    logMessage('Client script initialized. Ready for testing.');
    // Initial chart display with 'no data' in their respective (initially hidden) panels
    updateResponseTimeChart();
    updateResponseTimeHistogram();
    updateTokenUsageChart();
    updateSuccessRateChart();

    // Activate the first tab initially if needed (or handled by CSS :first-child)
    // document.querySelector('.tab-button')?.click(); // Optional: programmatically click first tab

}); // End of DOMContentLoaded