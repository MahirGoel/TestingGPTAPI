const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'data'); // Use data directory

// GET home page.
router.get('/', function(req, res, next) {
  res.render('index', { title: 'GPT Limit Tester' });
});

// GET history page.
router.get('/history', async function(req, res, next) {
  let historySummaries = [];
  try {
    // Ensure data directory exists
    try { 
        await fs.access(DATA_DIR); // Check if directory exists
    } catch (dirError) {
        if (dirError.code === 'ENOENT') {
            console.log(`Data directory ${DATA_DIR} not found, creating.`);
            await fs.mkdir(DATA_DIR, { recursive: true }); 
        } else {
            throw dirError; // Re-throw other access errors
        }
    }

    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json') && file.startsWith('test-')); // Filter for test JSON files

    for (const file of jsonFiles) {
      const filePath = path.join(DATA_DIR, file);
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const testRun = JSON.parse(data);
        // Extract only necessary summary data for the list view
        if (testRun && testRun.id && testRun.timestamp && testRun.parameters && testRun.summary) {
            historySummaries.push({
                id: testRun.id,
                timestamp: testRun.timestamp,
                parameters: testRun.parameters, // Pass parameters needed for display
                summary: testRun.summary
            });
        } else {
            console.warn(`Skipping invalid or incomplete data file: ${file}`);
        }
      } catch (parseError) {
        console.error(`Error processing history file ${file}:`, parseError);
        // Optionally: delete or move corrupted files
      }
    }

    // Sort by timestamp descending (most recent first)
    historySummaries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  } catch (error) {
    console.error("Error reading history directory or files:", error);
    // Proceed with empty historySummaries if directory reading fails
  }
  res.render('history', { title: 'Test History', history: historySummaries });
});

// GET history detail page.
router.get('/history/:testId', async function(req, res, next) {
  const testId = req.params.testId;
  // Basic validation/sanitization of testId might be good here
  if (!testId || !testId.startsWith('test-') || testId.includes('..')) {
      return res.status(400).send('Invalid test ID format.');
  }
  const filePath = path.join(DATA_DIR, `${testId}.json`); // Construct file path
  let testRun = null;

  try {
    const data = await fs.readFile(filePath, 'utf8');
    testRun = JSON.parse(data);
    // Add validation to ensure the parsed data looks like a test run
    if (!testRun || !testRun.id || testRun.id !== testId || !testRun.results) {
        console.error(`Invalid data structure in file: ${filePath}`);
        throw new Error('Invalid test run data structure');
    }

  } catch (error) {
    if (error.code === 'ENOENT') {
        console.log(`History file not found: ${filePath}`);
        // testRun remains null -> will trigger 404 below
    } else {
      console.error(`Error reading or parsing history file ${filePath}:`, error);
      // Don't expose internal errors directly, render a generic error or redirect
      // For now, pass to default handler
      return next(error); 
    }
  }

  if (!testRun) {
    return res.status(404).send('Test run not found.');
  }

  res.render('history_detail', {
    title: `Test Details - ${testRun.parameters?.model || 'Unknown Model'} (${new Date(testRun.timestamp).toLocaleDateString()})`,
    testRun: testRun // Pass the full test run data to the view
  });
});

module.exports = router; 