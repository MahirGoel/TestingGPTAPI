// Client-side script for the history detail page
document.addEventListener('DOMContentLoaded', () => {
    console.log("History Detail Page Loaded. Data:", historicalTestData);

    // --- Get DOM Elements ---
    const resultsTableBody = document.querySelector('#results-table tbody');
    const responsesRepeater = document.getElementById('responses-repeater');
    const avgResponseTimeSpan = document.getElementById('avg-response-time');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const sortableHeaders = document.querySelectorAll('#results-table th.sortable'); // Get sortable headers

    // Chart instances (similar to client.js)
    let responseTimeChart = null;
    let responseTimeHistogramChart = null;
    let tokenUsageChart = null;
    let successRateChart = null;

    // --- Sorting State ---
    let currentSortKey = null;
    let currentSortDir = 'none'; // none, asc, desc

    // Process the historical data
    const testData = {
        requestData: historicalTestData.results || [], // Array of request results
        successCount: historicalTestData.summary.successfulCount || 0,
        failCount: historicalTestData.summary.failedCount || 0,
        totalSent: historicalTestData.summary.totalRequests || 0
    };

    // --- Populate UI from historical data (Initial Populate) ---
    repopulateTable(); // Call repopulate which handles initial sort (by req#)
    populateResponseViewer(testData.requestData);
    calculateAndDisplayAvgTime(testData.requestData);
    updateSortIndicators(); // Set initial indicator state

    // --- Tab Switching Logic (same as client.js) ---
    if (tabButtons.length > 0 && tabPanels.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanels.forEach(panel => panel.classList.remove('active'));
                button.classList.add('active');
                const targetTabId = button.getAttribute('data-tab');
                const targetPanel = document.getElementById(targetTabId);
                if (targetPanel) {
                    targetPanel.classList.add('active');
                }
            });
        });
    } else {
        console.warn('Tab buttons or panels not found.');
    }

    // --- Table Sorting Logic ---
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.getAttribute('data-sort-key');
            let newSortDir = 'asc';
            if (sortKey === currentSortKey) {
                if (currentSortDir === 'asc') newSortDir = 'desc';
                else if (currentSortDir === 'desc') newSortDir = 'none';
                else newSortDir = 'asc';
            } else {
                newSortDir = 'asc';
            }
            currentSortKey = (newSortDir === 'none') ? null : sortKey;
            currentSortDir = newSortDir;
            updateSortIndicators();
            repopulateTable(); // Repopulate based on new sort
        });
    });

    function updateSortIndicators() {
        sortableHeaders.forEach(header => {
            const key = header.getAttribute('data-sort-key');
            if (key === currentSortKey && currentSortDir !== 'none') {
                header.setAttribute('data-sort-dir', currentSortDir);
            } else {
                header.removeAttribute('data-sort-dir');
            }
        });
    }

    function sortData(data) {
        // This function is identical to the sortData in client.js
        if (!currentSortKey || currentSortDir === 'none') {
            return [...data].sort((a, b) => a.requestNumber - b.requestNumber);
        }
        return [...data].sort((a, b) => {
            let valA, valB;
            if (currentSortKey === 'duration') {
                valA = parseFloat(a.duration ?? Infinity);
                valB = parseFloat(b.duration ?? Infinity);
            } else if (currentSortKey === 'tokens') {
                valA = a.usage?.total_tokens ?? 0;
                valB = b.usage?.total_tokens ?? 0;
            } else {
                return a.requestNumber - b.requestNumber;
            }
            if (isNaN(valA)) valA = (currentSortDir === 'asc' ? Infinity : -Infinity);
            if (isNaN(valB)) valB = (currentSortDir === 'asc' ? Infinity : -Infinity);
            if (valA < valB) return currentSortDir === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortDir === 'asc' ? 1 : -1;
            return a.requestNumber - b.requestNumber;
        });
    }

    function repopulateTable() {
        if (!resultsTableBody) return;
        resultsTableBody.innerHTML = ''; // Clear existing rows
        const sortedResults = sortData(testData.requestData);
        sortedResults.forEach(result => addResultToTable(result)); // addResultToTable is defined below
    }

    // --- UI Populate Functions ---
    function populateResponseViewer(results) {
        if (!responsesRepeater) return;
        responsesRepeater.innerHTML = ''; // Clear existing
        const successfulResponses = results.filter(r => r.status === 'Success');
        // Sort by request number before displaying
        successfulResponses.sort((a, b) => a.requestNumber - b.requestNumber);
        successfulResponses.forEach(result => addResponseToViewer(result));
    }

    function calculateAndDisplayAvgTime(results) {
        if (!avgResponseTimeSpan) return;
        const validDurations = results.map(d => parseFloat(d.duration)).filter(d => !isNaN(d) && d !== null);
        if (validDurations.length > 0) {
            const avgTime = validDurations.reduce((a, b) => a + b, 0) / validDurations.length;
            avgResponseTimeSpan.textContent = `${avgTime.toFixed(2)}`;
        } else {
             avgResponseTimeSpan.textContent = 'N/A';
        }
    }

    // --- UI Add Element Functions (Adapted from client.js) ---
    function addResultToTable(result) {
        if (!resultsTableBody) return;
        try {
            const row = resultsTableBody.insertRow();
            row.insertCell().textContent = result.requestNumber;
            const statusCell = row.insertCell();
            statusCell.textContent = result.status;
            statusCell.style.color = result.status === 'Success' ? 'green' : 'red';
            row.insertCell().textContent = result.duration ?? 'N/A'; // Handle null duration for failed

            // Tokens Cell
            const tokensCell = row.insertCell();
            if (result.status === 'Success' && result.usage) {
                tokensCell.textContent = `${result.usage.completion_tokens ?? '-'}/${result.usage.prompt_tokens ?? '-'}/${result.usage.total_tokens ?? '-'}`;
                tokensCell.title = `Completion: ${result.usage.completion_tokens}, Prompt: ${result.usage.prompt_tokens}, Total: ${result.usage.total_tokens}`;
            } else {
                 tokensCell.textContent = '-';
            }

            // OpenAI ID Cell
            const idCell = row.insertCell();
            idCell.textContent = result.openai_id ? result.openai_id.substring(0, 15) + '...' : '-';
            idCell.title = result.openai_id ?? 'N/A';

            // Snippet Cell
            const snippetCell = row.insertCell();
            const textToShow = String(result.status === 'Success' ? result.response : result.error || '');
            snippetCell.textContent = textToShow.substring(0, 50) + (textToShow.length > 50 ? '...' : '');
            snippetCell.title = textToShow;
        } catch (error) {
            console.error('Error adding result to history table:', result, error);
        }
    }

    function addResponseToViewer(result) {
        // This function is identical to the one in client.js, ensure it uses the correct data structure
        if (result.status !== 'Success' || !responsesRepeater) return;
        try {
            const responseDiv = document.createElement('div');
            responseDiv.classList.add('response-box');
            responseDiv.id = `response-${result.requestNumber}`;

            const title = document.createElement('h3');
            title.textContent = `Response #${result.requestNumber}`;

            const meta = document.createElement('div');
            meta.classList.add('meta');
            // Use parameters from the historical data if needed, though result obj has most now
            meta.textContent = `Time: ${result.duration}s | Model: ${result.model} | Tokens: ${result.maxTokens} | Temp: ${result.temperature} | TopP: ${result.topP}`;

            const contentDiv = document.createElement('div');
            contentDiv.classList.add('content');
            const responseText = String(result.response || ''); // Ensure string
            if (window.marked && typeof window.marked.parse === 'function') {
                 try {
                    contentDiv.innerHTML = marked.parse(responseText);
                 } catch (renderError) {
                     console.error('Error rendering markdown:', renderError, responseText);
                     contentDiv.textContent = `Error rendering response: ${responseText.substring(0, 100)}...`; // Show plain text on error
                 }
            } else {
                console.warn('marked.js not loaded.');
                const pre = document.createElement('pre');
                pre.textContent = responseText;
                contentDiv.appendChild(pre);
            }

            responseDiv.appendChild(title);
            responseDiv.appendChild(meta);
            responseDiv.appendChild(contentDiv);

            // No need to insert in order here as we populate all at once
            responsesRepeater.appendChild(responseDiv);

        } catch (error) {
            console.error('Error adding response to history viewer:', result, error);
        }
    }

    // --- Charting Functions (Adapted from client.js) ---
    // These functions need the `testData` object populated above

    function updateCharts() {
        console.log("Rendering charts from historical data:", testData);
        updateResponseTimeChart();
        updateResponseTimeHistogram();
        updateTokenUsageChart();
        updateSuccessRateChart();
    }

    function updateResponseTimeChart() {
        const canvas = document.getElementById('responseTimeChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (responseTimeChart) responseTimeChart.destroy();

        const validData = testData.requestData.filter(d => d.duration !== null && !isNaN(parseFloat(d.duration)));
        if (validData.length === 0) {
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             ctx.textAlign = 'center'; ctx.fillText('No response time data.', canvas.width/2, canvas.height/2);
             return;
        }
        validData.sort((a, b) => a.requestNumber - b.requestNumber);
        const labels = validData.map(d => `Req ${d.requestNumber}`);
        const dataPoints = validData.map(d => parseFloat(d.duration));

        responseTimeChart = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: 'Response Time (s)', data: dataPoints, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1, fill: true }] },
            options: { scales: { y: { beginAtZero: true, title: { display: true, text: 'Time (s)' } }, x: { title: { display: true, text: 'Request Number' } } }, responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Response Time Distribution' }, legend: { display: false } } }
        });
    }

    function updateResponseTimeHistogram() {
        const canvas = document.getElementById('responseTimeHistogramChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (responseTimeHistogramChart) responseTimeHistogramChart.destroy();

        const durations = testData.requestData.map(d => parseFloat(d.duration)).filter(d => d !== null && !isNaN(d));
        if (durations.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center'; ctx.fillText('No response time data.', canvas.width/2, canvas.height/2);
            return;
        }

        const maxDuration = Math.max(...durations);
        const minDuration = Math.min(...durations);
        const binCount = Math.min(10, Math.ceil(maxDuration));
        const binSize = binCount > 0 ? (maxDuration - minDuration + 0.01) / binCount : 1;
        const bins = Array(binCount).fill(0);
        const labels = Array(binCount).fill(0).map((_, i) => {
            const start = minDuration + i * binSize;
            const end = start + binSize;
            return `${start.toFixed(1)}-${end.toFixed(1)}s`;
        });
        durations.forEach(duration => {
            let binIndex = Math.floor((duration - minDuration) / binSize);
            if (binIndex >= binCount) binIndex = binCount - 1;
            if (binIndex >= 0) bins[binIndex]++;
        });

        responseTimeHistogramChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: 'Number of Requests', data: bins, backgroundColor: 'rgba(153, 102, 255, 0.6)', borderColor: 'rgba(153, 102, 255, 1)', borderWidth: 1 }] },
            options: { scales: { y: { beginAtZero: true, title: { display: true, text: 'Number of Requests' }, ticks: { stepSize: 1 } }, x: { title: { display: true, text: 'Response Time Bins (s)' } } }, responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Response Time Histogram' }, legend: { display: false } } }
        });
    }

    function updateTokenUsageChart() {
        const canvas = document.getElementById('tokenUsageChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (tokenUsageChart) tokenUsageChart.destroy();

        const successfulRequests = testData.requestData.filter(d => d.status === 'Success' && d.usage);
        if (successfulRequests.length === 0) {
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             ctx.textAlign = 'center'; ctx.fillText('No token usage data.', canvas.width/2, canvas.height/2);
            return;
        }
        successfulRequests.sort((a, b) => a.requestNumber - b.requestNumber);
        const labels = successfulRequests.map(d => `Req ${d.requestNumber}`);
        const completionTokens = successfulRequests.map(d => d.usage.completion_tokens);
        const promptTokens = successfulRequests.map(d => d.usage.prompt_tokens);
        const totalTokens = successfulRequests.map(d => d.usage.total_tokens);

        tokenUsageChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Total Tokens', data: totalTokens, borderColor: 'rgb(255, 159, 64)', backgroundColor: 'rgba(255, 159, 64, 0.2)', yAxisID: 'y', tension: 0.1, fill: false },
                    { label: 'Completion Tokens', data: completionTokens, borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgba(54, 162, 235, 0.2)', hidden: true, yAxisID: 'y', tension: 0.1, fill: false },
                    { label: 'Prompt Tokens', data: promptTokens, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', hidden: true, yAxisID: 'y', tension: 0.1, fill: false }
                ]
            },
            options: { scales: { y: { beginAtZero: true, title: { display: true, text: 'Tokens' }, position: 'left' }, x: { title: { display: true, text: 'Request Number' } } }, responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Token Usage per Request' }, legend: { display: true, position: 'top' }, tooltip: { mode: 'index', intersect: false } } }
        });
    }

    function updateSuccessRateChart() {
        const canvas = document.getElementById('successRateChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (successRateChart) successRateChart.destroy();

        const totalProcessed = testData.successCount + testData.failCount;
        if (totalProcessed === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center'; ctx.fillText('No success/failure data.', canvas.width/2, canvas.height/2);
            return;
        }

        successRateChart = new Chart(ctx, {
            type: 'pie',
            data: { labels: ['Successful', 'Failed'], datasets: [{ label: 'Request Outcomes', data: [testData.successCount, testData.failCount], backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)'], borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'], borderWidth: 1 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Success vs. Failure Rate' }, tooltip: { callbacks: { label: function(context) { let label = context.label || ''; if (label) label += ': '; if (context.parsed !== null) { const percentage = totalProcessed > 0 ? ((context.parsed / totalProcessed) * 100).toFixed(1) : 0; label += `${context.parsed} (${percentage}%)`; } return label; } } }, legend: { position: 'top' } } }
        });
    }

    // --- Initial Execution ---
    updateCharts(); // Render charts based on the embedded historical data

}); // End of DOMContentLoaded 