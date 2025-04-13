const express = require('express');
const testController = require('../controllers/testController');
const router = express.Router();

// POST route to start the concurrent tests
router.post('/start-test', testController.startTest);

// GET route for Server-Sent Events connection
router.get('/events/:clientId', testController.handleEvents);

module.exports = router; 