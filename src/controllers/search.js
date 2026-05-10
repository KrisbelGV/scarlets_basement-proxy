const {InputError} = require('../middleware/validator');
const catchAsync = require('../utils/catchAsync');
const createAbortController = require('../utils/createAbortController');
const { clearScratchFailure } = require('../utils/upstash');
const {
  validateFollowing,
  searchProjectsByProfiles,
  searchProjectsGeneralFromQuery
} = require('../services/filterService');

exports.getSearchResults = catchAsync(async function getSearchResults(req, res, next) {
  const signal = createAbortController();

  const {q, mode, discard} = res.locals;
  const userName = res.locals.queryusername;
  const profiles = res.locals.profiles;
  let projectsFound = [];

  if(userName && profiles){
    const following = await validateFollowing(userName, profiles, signal);
    if(following.length === 0) throw new InputError('No following on profiles', 422);
    projectsFound = await searchProjectsByProfiles(q, discard, following, signal);
  }
  else {
    projectsFound = await searchProjectsGeneralFromQuery(q, mode, discard, signal);
  }
  projectsFound = projectsFound.length === 0 ?
    {results: 'No search results'}
    : {results: projectsFound};

  if (res.locals.scratchWasDown) {
    await clearScratchFailure().catch(() => {});
  }

  return res.status(200).json({
    ...projectsFound,
    aborted: signal.aborted
  });
});