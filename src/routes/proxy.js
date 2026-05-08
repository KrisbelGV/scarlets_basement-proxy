const express = require('express');
const router = express.Router();

const {
  validateUserName,
  validateProfiles,
  validateSearchParams,
  validateProject,
  validateUserTags
} = require('../middleware/validator');

const { getUserData } = require('../controllers/userData');
const { getSearchResults } = require('../controllers/search');
const { getStudioForAProject } = require('../controllers/findAStudio');
const { getProjectDataFromIndex } = require('../controllers/isItIndex');
const { getProjectsFromFollowing } = require('../controllers/aNewView');

const { dailyRateGuard, processingGuard } = require('../middleware/doorman');

router.get('/userdata/:username', 
  dailyRateGuard,
  validateUserName, 
  processingGuard, 
  getUserData
);

router.get('/search', 
  dailyRateGuard,
  validateSearchParams, 
  validateUserName, 
  validateProfiles, 
  processingGuard,
  getSearchResults
);

router.get('/findastudio/:projectid', 
  dailyRateGuard,
  validateProject, 
  validateUserTags, 
  processingGuard,
  getStudioForAProject
);

router.get('/isitindex/:projectid', 
  dailyRateGuard,
  validateProject, 
  processingGuard,
  getProjectDataFromIndex
);

router.get('/anewview/:username', 
  dailyRateGuard,
  validateUserName, 
  processingGuard,
  getProjectsFromFollowing
);

module.exports = router;